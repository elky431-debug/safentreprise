/**
 * Maintenance : renouvellement des abonnements et rattrapage delta.
 *
 * Séparée du worker à dessein. Le worker tourne toutes les minutes et doit
 * rester court ; la maintenance est plus lente, plus rare, et son échec n'a
 * pas les mêmes conséquences. Les mélanger ferait qu'un rattrapage lent
 * retarderait l'analyse des messages en file.
 *
 * DEUX TRAVAUX INDÉPENDANTS :
 *
 *   • Renouveler les abonnements qui expirent. Un abonnement Outlook vit au
 *     plus 10 080 minutes — un peu moins de 7 jours. On renouvelle 24 h avant.
 *
 *   • Rattraper par delta. C'est le seul filet qui ne dépend de rien : il
 *     compare ce que la boîte contient à ce qu'on a déjà vu. Sans lui, une
 *     panne de quelques heures laisse passer des mails frauduleux, parce que
 *     Microsoft cesse de retenter au bout de 4 h.
 *
 * L'un ne doit jamais empêcher l'autre : chacun a son try/catch.
 */
import {
  ErreurGraph,
  appelGraph,
  creerAbonnement,
  remplacerCorps,
  renouvelerAbonnement,
} from "@/lib/microsoft/graph";
import {
  construireBanniere,
  construireBanniereTexte,
  contientBanniere,
  corpsEstHtml,
  poserBanniere,
  poserBanniereTexte,
  texteVersHtml,
  type NiveauBanniere,
} from "@/lib/microsoft/banniere";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Marge avant expiration. Un renouvellement inutile ne coûte rien. */
const MARGE_HEURES = 24;

/** Durée demandée : sous le maximum, pour absorber le décalage d'horloge. */
const DUREE_MINUTES = 9600; // ~6,7 jours, plafond 10 080

const BUDGET_MS = 25_000;
const MAX_MESSAGES_DELTA = 200;

type Abonnement = {
  abonnement_id: string;
  subscription_id: string;
  company_id: string;
  boite_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  expire_at: string;
  statut: string;
  tentatives: number;
  notification_url: string | null;
};

type Boite = {
  boite_id: string;
  company_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  delta_link: string | null;
  urgent: boolean;
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

async function rpc<T>(nom: string, parametres: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.");
  }

  const reponse = await fetch(`${url}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parametres),
  });

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`${nom} : HTTP ${reponse.status} — ${texte.slice(0, 300)}`);
  }
  return (texte.trim() === "" ? null : JSON.parse(texte)) as T;
}

/* ==========================================================================
   Où Microsoft doit envoyer les notifications
   ========================================================================== */

/**
 * Le chemin du point d'entrée qui reçoit les notifications Graph.
 *
 * C'est `src/app/api/microsoft/webhook/route.ts`. Si ce fichier était déplacé,
 * cette constante devrait suivre — c'est la seule chose qui les relie.
 */
const CHEMIN_WEBHOOK = "/api/microsoft/webhook";

type Origine = { url: string; source: string };

/**
 * Une adresse candidate, normalisée et vérifiée.
 *
 * Microsoft appelle cette adresse depuis l'extérieur, en HTTPS, avant même
 * d'accepter de créer l'abonnement. Une adresse en http, ou pointant sur la
 * machine locale, ne peut pas fonctionner : mieux vaut l'écarter ici que
 * laisser Graph refuser sans qu'on sache pourquoi.
 *
 * Une base sans chemin (« https://exemple.fr ») se voit compléter du chemin du
 * webhook. Un chemin déjà présent est respecté tel quel : quelqu'un qui a
 * configuré un mandataire sur une autre adresse a ses raisons.
 */
function candidate(valeur: string | undefined | null, source: string): Origine | null {
  if (!valeur || !valeur.trim()) return null;
  let analysee: URL;
  try {
    analysee = new URL(valeur.trim());
  } catch {
    return null;
  }
  if (analysee.protocol !== "https:") return null;
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(analysee.hostname)) return null;

  const chemin = analysee.pathname.replace(/\/+$/, "");
  return { url: `${analysee.origin}${chemin === "" ? CHEMIN_WEBHOOK : chemin}`, source };
}

/**
 * L'adresse à donner à Microsoft, par ordre de confiance décroissant.
 *
 * POURQUOI CETTE CASCADE. Un abonnement est mort le 26 août après dix
 * tentatives, toutes avec la même cause : GRAPH_NOTIFICATION_URL n'était pas
 * définie sur Netlify. Une variable oubliée ne doit pas pouvoir arrêter la
 * surveillance : le code sait déjà, par trois autres chemins, à quelle adresse
 * il est joignable.
 *
 *   1. la variable, si elle existe — une décision explicite l'emporte ;
 *   2. l'adresse que CET abonnement utilisait quand il fonctionnait, telle que
 *      Microsoft nous l'a renvoyée ;
 *   3. l'adresse du déploiement courant (Netlify la fournit) ;
 *   4. l'adresse par laquelle la maintenance vient d'être appelée.
 *
 * Le 4 vient en dernier parce qu'il repose sur un en-tête fourni par
 * l'appelant. Ce n'est pas ouvert pour autant : la maintenance exige déjà
 * WORKER_SECRET. Et la source retenue est renvoyée dans la réponse puis
 * enregistrée en base — si elle change, cela se voit.
 */
function urlNotification(requete: Request, abonnement?: Abonnement): Origine | null {
  const enTetes = requete.headers;
  const hote = enTetes.get("x-forwarded-host") ?? enTetes.get("host");
  const protocole = enTetes.get("x-forwarded-proto") ?? "https";

  return (
    candidate(process.env.GRAPH_NOTIFICATION_URL, "GRAPH_NOTIFICATION_URL") ??
    candidate(abonnement?.notification_url, "adresse déjà utilisée par cet abonnement") ??
    candidate(process.env.DEPLOY_PRIME_URL, "DEPLOY_PRIME_URL (déploiement Netlify)") ??
    candidate(process.env.URL, "URL (site Netlify)") ??
    candidate(hote ? `${protocole}://${hote}` : null, "adresse d'appel de la maintenance")
  );
}

/* ==========================================================================
   Renouvellement
   ========================================================================== */

async function renouveler(requete: Request): Promise<Record<string, unknown>> {
  const abonnements = await rpc<Abonnement[]>("abonnements_a_renouveler", {
    p_marge_heures: MARGE_HEURES,
  });

  if (!Array.isArray(abonnements) || abonnements.length === 0) {
    // Rien à renouveler, mais on dit quand même à quelle adresse on recréerait
    // un abonnement : c'est le seul moyen de vérifier la configuration AVANT
    // d'en avoir besoin.
    const origine = urlNotification(requete);
    return {
      examines: 0,
      renouveles: 0,
      recrees: 0,
      echecs: 0,
      details: [],
      adresse_notification: origine?.url ?? "AUCUNE ADRESSE UTILISABLE",
      source_adresse: origine?.source ?? "aucune",
    };
  }

  const details: Record<string, unknown>[] = [];
  let renouveles = 0;
  let recrees = 0;
  let echecs = 0;

  for (const abonnement of abonnements) {
    const expiration = new Date(Date.now() + DUREE_MINUTES * 60_000).toISOString();

    try {
      // « perdu » : Microsoft l'a supprimé. Le renouveler renverrait 404 —
      // il faut en créer un nouveau.
      if (abonnement.statut === "perdu") {
        const origine = urlNotification(requete, abonnement);
        if (!origine) {
          throw new Error(
            "Aucune adresse de notification utilisable : ni GRAPH_NOTIFICATION_URL, " +
              "ni adresse enregistrée sur l'abonnement, ni adresse de déploiement " +
              "(DEPLOY_PRIME_URL / URL), ni en-tête d'hôte exploitable en HTTPS.",
          );
        }
        const cree = await creerAbonnement(
          abonnement.tenant_id,
          abonnement.graph_user_id,
          origine.url,
          expiration,
        );
        await rpc("maj_abonnement_graph", {
          p_abonnement_id: abonnement.abonnement_id,
          p_subscription_id: cree.id,
          p_expire_at: cree.expirationDateTime,
          p_statut: "actif",
          p_erreur: null,
          // Le nouveau secret partagé DOIT remplacer l'ancien : sans ça, les
          // notifications du nouvel abonnement seraient toutes refusées.
          p_client_state: cree.clientState,
          // On retient l'adresse que Microsoft dit utiliser, pas celle qu'on
          // croit avoir demandée.
          p_notification_url: cree.notificationUrl ?? origine.url,
        });
        recrees += 1;
        details.push({
          upn: abonnement.upn,
          action: "recree",
          expire: cree.expirationDateTime,
          adresse: cree.notificationUrl ?? origine.url,
          source: origine.source,
        });
        continue;
      }

      const maj = await renouvelerAbonnement(
        abonnement.tenant_id,
        abonnement.subscription_id,
        expiration,
      );
      await rpc("maj_abonnement_graph", {
        p_abonnement_id: abonnement.abonnement_id,
        p_subscription_id: null,
        p_expire_at: maj.expirationDateTime,
        p_statut: "actif",
        p_erreur: null,
        // Prolonger ne change pas l'adresse chez Microsoft ; sa réponse la
        // contient, et c'est l'occasion de la retenir pour les abonnements
        // créés avant que la colonne existe.
        p_notification_url: maj.notificationUrl ?? null,
      });
      renouveles += 1;
      details.push({
        upn: abonnement.upn,
        action: "renouvele",
        expire: maj.expirationDateTime,
        adresse: maj.notificationUrl ?? abonnement.notification_url ?? "inconnue",
      });
    } catch (erreur) {
      const graph = erreur instanceof ErreurGraph ? erreur : null;
      const detail = messageDe(erreur);

      // 404 : l'abonnement n'existe plus chez Microsoft. On le marque perdu,
      // le prochain passage le recréera au lieu d'essayer de le renouveler.
      const introuvable = graph?.statut === 404;

      await rpc("maj_abonnement_graph", {
        p_abonnement_id: abonnement.abonnement_id,
        p_subscription_id: null,
        p_expire_at: null,
        p_statut: introuvable ? "perdu" : "erreur",
        p_erreur: detail.slice(0, 500),
      }).catch(() => {});

      echecs += 1;
      details.push({
        upn: abonnement.upn,
        action: introuvable ? "marque-perdu" : "echec",
        erreur: detail.slice(0, 200),
      });
      console.error(`[maintenance] abonnement ${abonnement.upn} : ${detail}`);
    }
  }

  return { examines: abonnements.length, renouveles, recrees, echecs, details };
}

/* ==========================================================================
   Rattrapage delta
   ========================================================================== */

type PageDelta = {
  value?: { id?: string }[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

/** Un jeton delta périmé se reconnaît à ceci. */
function jetonPerime(erreur: unknown): boolean {
  if (!(erreur instanceof ErreurGraph)) return false;
  return (
    erreur.statut === 410 ||
    erreur.code === "syncStateNotFound" ||
    erreur.code === "resyncRequired"
  );
}

/**
 * Rattrape une boîte.
 *
 * ⚠ L'AMORÇAGE N'ENFILE RIEN. Le premier appel delta renvoie TOUTE la boîte de
 *   réception. Mettre ces messages en file reviendrait à analyser — et donc à
 *   bannièrer — des mois de courrier déjà lu. On parcourt donc les pages pour
 *   atteindre le deltaLink, sans rien enfiler : le rattrapage ne couvre que ce
 *   qui arrive APRÈS.
 *
 *   Même chose après un jeton périmé : on ré-amorce sans enfiler, sinon une
 *   expiration de jeton déclencherait le même déluge.
 */
async function rattraperBoite(boite: Boite, echeance: number) {
  const amorcage = !boite.delta_link;
  let chemin =
    boite.delta_link ??
    `/users/${encodeURIComponent(boite.graph_user_id)}/mailFolders/inbox/messages/delta?$select=id`;

  let vus = 0;
  let enfiles = 0;
  let pages = 0;
  let deltaLink: string | null = null;

  while (chemin && Date.now() < echeance && vus < MAX_MESSAGES_DELTA) {
    let page: PageDelta;
    try {
      page = await appelGraph<PageDelta>(boite.tenant_id, "GET", chemin);
    } catch (erreur) {
      if (!jetonPerime(erreur)) throw erreur;

      // Jeton périmé : on repart de zéro, SANS enfiler.
      await rpc("maj_delta_boite", {
        p_boite_id: boite.boite_id,
        p_delta_link: null,
        p_erreur: "jeton delta périmé, ré-amorçage au prochain passage",
      });
      return { upn: boite.upn, action: "jeton-perime", vus, enfiles: 0, pages };
    }

    pages += 1;
    for (const message of page.value ?? []) {
      if (!message.id) continue;
      vus += 1;
      if (amorcage) continue;
      const ajoute = await rpc<boolean>("enregistrer_message_delta", {
        p_boite_id: boite.boite_id,
        p_message_id: message.id,
      });
      if (ajoute) enfiles += 1;
    }

    const suivant = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? null;
    // Lien absolu conservé tel quel : appelGraph sait le reconnaître.
    chemin = suivant ?? "";
  }

  // On ne remplace le lien que si on a atteint la fin du cycle. Un lien
  // intermédiaire (nextLink) ne sert pas de point de reprise.
  await rpc("maj_delta_boite", {
    p_boite_id: boite.boite_id,
    p_delta_link: deltaLink,
    p_erreur: deltaLink ? null : "cycle non terminé, repris au prochain passage",
  });

  return {
    upn: boite.upn,
    action: amorcage ? "amorce" : "rattrape",
    vus,
    enfiles,
    pages,
    termine: Boolean(deltaLink),
  };
}

async function rattraper(): Promise<Record<string, unknown>> {
  const boites = await rpc<Boite[]>("boites_a_rattraper", {
    p_interval_minutes: 15,
    p_limite: 10,
  });

  if (!Array.isArray(boites) || boites.length === 0) {
    return { examinees: 0, enfiles: 0, details: [] };
  }

  const echeance = Date.now() + BUDGET_MS;
  const details: Record<string, unknown>[] = [];
  let enfiles = 0;

  for (const boite of boites) {
    if (Date.now() > echeance) break;
    try {
      const resultat = await rattraperBoite(boite, echeance);
      enfiles += (resultat.enfiles as number) ?? 0;
      details.push(resultat);
    } catch (erreur) {
      const detail = messageDe(erreur);
      console.error(`[maintenance] delta ${boite.upn} : ${detail}`);
      await rpc("maj_delta_boite", {
        p_boite_id: boite.boite_id,
        p_delta_link: null,
        p_erreur: detail.slice(0, 500),
      }).catch(() => {});
      details.push({ upn: boite.upn, action: "echec", erreur: detail.slice(0, 200) });
    }
  }

  return { examinees: boites.length, enfiles, details };
}

/* ==========================================================================
   Rattrapage des bannières manquantes
   ========================================================================== */

type AlerteSansBanniere = {
  message_id: string;
  company_id: string;
  boite_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  niveau: NiveauBanniere;
  score: number;
  signaux: string[];
  action_etat: string | null;
  action_tentatives: number;
};

/**
 * Repose les bannières qui manquent.
 *
 * POURQUOI CE TRAVAIL EXISTE. Une fois le verdict enregistré, le travail passe
 * à « traite » et ne revient jamais dans la file. Sans ce rattrapage, une
 * alerte dont l'action a échoué — ou n'a jamais été tentée, parce que
 * l'écriture était désactivée à ce moment-là — reste sans bannière POUR
 * TOUJOURS. C'est ce qui laissait passer un mail frauduleux sans avertissement.
 *
 * On ne réanalyse pas : les signaux sont déjà en base. La bannière reposée est
 * donc exactement celle qu'on aurait posée sur le moment, indépendamment du
 * contexte d'entreprise du jour.
 */
async function rattraperBannieres(): Promise<Record<string, unknown>> {
  const mode = (process.env.GRAPH_ACTIONS ?? "off").trim().toLowerCase();
  if (mode !== "complet") {
    return { mode, posees: 0, details: [], note: "écriture non activée" };
  }

  const alertes = await rpc<AlerteSansBanniere[]>("alertes_a_bannieriser", {
    p_limite: 10,
  });

  if (!Array.isArray(alertes) || alertes.length === 0) {
    return { mode, examinees: 0, posees: 0, details: [] };
  }

  const details: Record<string, unknown>[] = [];
  let posees = 0;

  for (const alerte of alertes) {
    try {
      const message = await appelGraph<{
        body?: { contentType?: string; content?: string };
      }>(
        alerte.tenant_id,
        "GET",
        `/users/${encodeURIComponent(alerte.graph_user_id)}/messages/` +
          `${encodeURIComponent(alerte.message_id)}?$select=id,body`,
      );

      const origine = message.body?.content ?? "";
      // Même règle que le worker : c'est le contenu qui décide, pas le
      // contentType annoncé par Graph.
      const texteBrut = !corpsEstHtml(message.body);

      if (contientBanniere(origine)) {
        // Elle était là : c'est l'enregistrement qui avait manqué, pas la pose.
        await rpc("marquer_action_graph", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
          p_categorie: null,
          p_banniere_posee: true,
          p_erreur: null,
          p_action_etat: "posee",
        });
        posees += 1;
        details.push({ message: alerte.message_id.slice(0, 20), etat: "deja-la-trace-corrigee" });
        continue;
      }

      // Même règle que le worker : pas de sauvegarde, pas de modification.
      const sauvegarde = await rpc<string>("sauvegarder_corps_graph", {
        p_company_id: alerte.company_id,
        p_message_id: alerte.message_id,
        p_contenu: origine,
        p_content_type: texteBrut ? "text" : "html",
      });

      if (sauvegarde !== "sauvegarde" && sauvegarde !== "deja-sauvegarde") {
        await rpc("marquer_action_graph", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
          p_categorie: null,
          p_banniere_posee: false,
          p_erreur: `corps d'origine non sauvegardé (${sauvegarde}) — message NON modifié`,
          p_action_etat: "echec",
        });
        details.push({
          message: alerte.message_id.slice(0, 20),
          etat: "echec",
          erreur: `sauvegarde : ${sauvegarde}`,
        });
        continue;
      }

      const contenu = {
        niveau: alerte.niveau,
        score: alerte.score,
        signaux: Array.isArray(alerte.signaux) ? alerte.signaux : [],
      };

      // Comme le worker : on convertit en HTML, la sauvegarde vient d'être
      // faite juste au-dessus donc la restauration reste exacte.
      await remplacerCorps(
        alerte.tenant_id,
        alerte.graph_user_id,
        alerte.message_id,
        poserBanniere(
          texteBrut ? texteVersHtml(origine) : origine,
          construireBanniere(contenu),
        ),
        "html",
      );

      // Même vérification que dans le worker : si on ne saurait pas la
      // retirer, on rétablit le corps d'origine tant qu'on l'a en mémoire.
      const relu = await appelGraph<{ body?: { content?: string } }>(
        alerte.tenant_id,
        "GET",
        `/users/${encodeURIComponent(alerte.graph_user_id)}/messages/` +
          `${encodeURIComponent(alerte.message_id)}?$select=id,body`,
      );

      if (!contientBanniere(relu.body?.content ?? "")) {
        await remplacerCorps(
          alerte.tenant_id,
          alerte.graph_user_id,
          alerte.message_id,
          origine,
          texteBrut ? "text" : "html",
        );
        await rpc("marquer_action_graph", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
          p_categorie: null,
          p_banniere_posee: false,
          p_erreur: "bannière non retrouvable après écriture, corps rétabli",
          p_action_etat: "annulee-non-verifiable",
        });
        details.push({ message: alerte.message_id.slice(0, 20), etat: "annulee-non-verifiable" });
        continue;
      }

      await rpc("marquer_action_graph", {
        p_company_id: alerte.company_id,
        p_message_id: alerte.message_id,
        p_categorie: null,
        p_banniere_posee: true,
        p_erreur: null,
        p_action_etat: "posee",
      });
      posees += 1;
      details.push({ message: alerte.message_id.slice(0, 20), etat: "posee" });
    } catch (erreur) {
      const graph = erreur instanceof ErreurGraph ? erreur : null;
      const detail = messageDe(erreur);

      // Message supprimé ou déplacé : il n'y a plus rien à bannièrer.
      if (graph?.statut === 404) {
        await rpc("abandonner_action_graph", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
          p_erreur: "message introuvable — supprimé ou déplacé",
        }).catch(() => {});
        details.push({ message: alerte.message_id.slice(0, 20), etat: "abandonnee-404" });
        continue;
      }

      await rpc("marquer_action_graph", {
        p_company_id: alerte.company_id,
        p_message_id: alerte.message_id,
        p_categorie: null,
        p_banniere_posee: false,
        p_erreur: detail.slice(0, 500),
        p_action_etat: "echec",
      }).catch(() => {});

      console.error(`[maintenance] bannière ${alerte.message_id} : ${detail}`);
      details.push({
        message: alerte.message_id.slice(0, 20),
        etat: "echec",
        erreur: detail.slice(0, 200),
        tentatives: alerte.action_tentatives + 1,
      });
    }
  }

  return { mode, examinees: alertes.length, posees, details };
}

/* ==========================================================================
   Conversion des bannières texte restantes
   ========================================================================== */

type ACconvertir = {
  message_id: string;
  company_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  niveau: NiveauBanniere;
  score: number;
  signaux: string[];
  banniere_format: string | null;
};

/**
 * Convertit en HTML les messages qui portent encore une bannière texte.
 *
 * Ces messages ont été traités avant que la conversion soit possible. On repart
 * du CORPS D'ORIGINE conservé en base — jamais du corps actuel, qui contient
 * déjà une bannière : le reconvertir figerait l'ancienne dedans.
 *
 * Le format inconnu (lignes antérieures à la colonne) est inspecté plutôt que
 * supposé : si le corps est déjà en HTML, on se contente d'enregistrer le
 * format sans rien modifier.
 */
async function convertirBannieres(): Promise<Record<string, unknown>> {
  const mode = (process.env.GRAPH_ACTIONS ?? "off").trim().toLowerCase();
  if (mode !== "complet") {
    return { mode, converties: 0, details: [], note: "écriture non activée" };
  }

  const cibles = await rpc<ACconvertir[]>("bannieres_a_convertir", { p_limite: 10 });
  if (!Array.isArray(cibles) || cibles.length === 0) {
    return { mode, examinees: 0, converties: 0, details: [] };
  }

  const details: Record<string, unknown>[] = [];
  let converties = 0;

  for (const cible of cibles) {
    const court = cible.message_id.slice(0, 20);
    try {
      const actuel = await appelGraph<{
        body?: { contentType?: string; content?: string };
      }>(
        cible.tenant_id,
        "GET",
        `/users/${encodeURIComponent(cible.graph_user_id)}/messages/` +
          `${encodeURIComponent(cible.message_id)}?$select=id,body`,
      );

      // Déjà en HTML : rien à convertir, seulement à consigner.
      if (corpsEstHtml(actuel.body)) {
        await rpc("marquer_action_graph", {
          p_company_id: cible.company_id,
          p_message_id: cible.message_id,
          p_categorie: null,
          p_banniere_posee: true,
          p_erreur: null,
          p_action_etat: "posee",
          p_banniere_format: "html",
        });
        details.push({ message: court, etat: "deja-html" });
        continue;
      }

      // On repart du corps D'ORIGINE, pas de celui qui porte la bannière.
      const [original] = await rpc<
        { contenu: string; content_type: string }[]
      >("corps_original_graph", {
        p_company_id: cible.company_id,
        p_message_id: cible.message_id,
      });

      if (!original) {
        // bannieres_a_convertir ne devrait pas les renvoyer, mais une purge
        // peut passer entre la requête et ici.
        details.push({ message: court, etat: "sans-original" });
        continue;
      }

      const corpsHtml =
        original.content_type === "text"
          ? texteVersHtml(original.contenu)
          : original.contenu;

      await remplacerCorps(
        cible.tenant_id,
        cible.graph_user_id,
        cible.message_id,
        poserBanniere(
          corpsHtml,
          construireBanniere({
            niveau: cible.niveau,
            score: cible.score,
            signaux: Array.isArray(cible.signaux) ? cible.signaux : [],
          }),
        ),
        "html",
      );

      // Même vérification que partout ailleurs : si on ne saurait pas la
      // retirer, on rétablit l'original — on l'a en main, ici.
      const relu = await appelGraph<{ body?: { content?: string } }>(
        cible.tenant_id,
        "GET",
        `/users/${encodeURIComponent(cible.graph_user_id)}/messages/` +
          `${encodeURIComponent(cible.message_id)}?$select=id,body`,
      );

      if (!contientBanniere(relu.body?.content ?? "")) {
        await remplacerCorps(
          cible.tenant_id,
          cible.graph_user_id,
          cible.message_id,
          original.contenu,
          original.content_type === "text" ? "text" : "html",
        );
        await rpc("marquer_action_graph", {
          p_company_id: cible.company_id,
          p_message_id: cible.message_id,
          p_categorie: null,
          p_banniere_posee: false,
          p_erreur: "bannière non retrouvable après conversion, original rétabli",
          p_action_etat: "annulee-non-verifiable",
        });
        details.push({ message: court, etat: "annulee-non-verifiable" });
        continue;
      }

      await rpc("marquer_action_graph", {
        p_company_id: cible.company_id,
        p_message_id: cible.message_id,
        p_categorie: null,
        p_banniere_posee: true,
        p_erreur: null,
        p_action_etat: "posee",
        p_banniere_format: "html",
      });
      converties += 1;
      details.push({ message: court, etat: "convertie" });
    } catch (erreur) {
      const detail = messageDe(erreur);
      console.error(`[maintenance] conversion ${cible.message_id} : ${detail}`);
      await rpc("marquer_action_graph", {
        p_company_id: cible.company_id,
        p_message_id: cible.message_id,
        p_categorie: null,
        p_banniere_posee: true,
        p_erreur: `conversion impossible : ${detail}`.slice(0, 500),
        p_action_etat: "posee",
        p_banniere_format: "texte",
      }).catch(() => {});
      details.push({ message: court, etat: "echec", erreur: detail.slice(0, 200) });
    }
  }

  return { mode, examinees: cibles.length, converties, details };
}

/* ==========================================================================
   Point d'entrée
   ========================================================================== */

function autorise(request: Request): boolean {
  const attendu = process.env.WORKER_SECRET;
  if (!attendu) return false;
  const fourni =
    request.headers.get("x-safentreprise-worker") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return fourni === attendu;
}

export async function POST(request: Request) {
  if (!autorise(request)) return new Response("non autorisé", { status: 401 });

  const url = new URL(request.url);
  const seulement = url.searchParams.get("seulement");

  // Les deux travaux sont indépendants : l'échec de l'un ne doit pas priver
  // l'autre. Un renouvellement en panne ne doit pas suspendre le rattrapage,
  // qui est précisément le filet prévu pour ce cas-là.
  const resultat: Record<string, unknown> = {};

  if (seulement !== "delta") {
    try {
      resultat.abonnements = await renouveler(request);
    } catch (erreur) {
      resultat.abonnements = { erreur: messageDe(erreur) };
      console.error("[maintenance] renouvellement :", messageDe(erreur));
    }
  }

  if (seulement !== "abonnements") {
    try {
      resultat.delta = await rattraper();
    } catch (erreur) {
      resultat.delta = { erreur: messageDe(erreur) };
      console.error("[maintenance] delta :", messageDe(erreur));
    }
  }

  // Troisième travail, tout aussi indépendant : reposer les bannières
  // manquantes. C'est le seul chemin qui rattrape une alerte dont l'action
  // n'a pas abouti — le travail correspondant est « traite » et ne reviendra
  // jamais dans la file.
  if (seulement !== "abonnements" && seulement !== "delta") {
    try {
      resultat.bannieres = await rattraperBannieres();
    } catch (erreur) {
      resultat.bannieres = { erreur: messageDe(erreur) };
      console.error("[maintenance] bannières :", messageDe(erreur));
    }

    // Quatrième travail : convertir en HTML les bannières texte posées avant
    // que la conversion soit possible.
    try {
      resultat.conversions = await convertirBannieres();
    } catch (erreur) {
      resultat.conversions = { erreur: messageDe(erreur) };
      console.error("[maintenance] conversions :", messageDe(erreur));
    }
  }

  return Response.json(resultat);
}

export async function GET(request: Request) {
  return POST(request);
}
