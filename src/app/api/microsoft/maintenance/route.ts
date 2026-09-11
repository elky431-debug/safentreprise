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
  assurerDossierService,
  creerAbonnement,
  deplacerMessage,
  listerDossierService,
  domainesDeAnnuaire,
  listerAnnuaire,
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
import { avecContexteJournal } from "@/lib/microsoft/journal";

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
  analyse_id: string;
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
/**
 * Ramène en boîte de réception les messages restés dans le dossier de service.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LA COUCHE QUI TIENT LA PROMESSE : « en aucun cas un message légitime
 * ne doit rester coincé dans un dossier de service ».
 *
 * Le worker sort le message de la boîte de réception pour l'y remettre
 * aussitôt — c'est ce qui force Outlook desktop à relire le corps modifié. Si
 * le retour échoue trois fois de suite, le message reste dans le sous-dossier.
 * Visible par son destinataire, certes, mais ce n'est pas à lui de réparer.
 *
 * Ce balayage est INDÉPENDANT DU WORKER : si celui-ci est mort au milieu de
 * son travail, la maintenance passe quand même, de nuit, et vide le dossier.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠ IL NE LIT AUCUN CORPS. Il ne demande que les identifiants et les
 *   déplace : un ménage n'a pas à ouvrir le courrier de qui que ce soit.
 *
 * ⚠ IL RAMÈNE TOUT CE QU'IL TROUVE, y compris ce dont la base n'a pas gardé
 *   trace. Un message dans ce dossier n'a rien à y faire, quelle qu'en soit
 *   la raison : on le rend d'abord, on s'interroge ensuite.
 */
async function ramenerMessagesEnTransit(): Promise<Record<string, unknown>> {
  type EnTransit = {
    analyse_id: string;
    company_id: string;
    message_id: string;
    graph_user_id: string;
    tenant_id: string;
    dossier_service_id: string | null;
  };

  // Cinq minutes : un déplacement dure une fraction de seconde, mais le
  // worker peut être en train d'en faire un à l'instant même. On ne marche
  // pas sur ses pieds.
  const bloques = await rpc<EnTransit[]>("messages_en_deplacement", {
    p_minutes: 5,
  });

  if (!Array.isArray(bloques) || bloques.length === 0) {
    return { examinees: 0, ramenes: 0, details: [] };
  }

  // Une boîte peut porter plusieurs messages bloqués : on balaie le dossier
  // une fois par boîte plutôt qu'une fois par message.
  const boites = new Map<string, EnTransit[]>();
  for (const b of bloques) {
    const liste = boites.get(b.graph_user_id);
    if (liste) liste.push(b);
    else boites.set(b.graph_user_id, [b]);
  }

  const details: Record<string, unknown>[] = [];
  let ramenes = 0;

  for (const [graphUserId, lignes] of boites) {
    const ref = lignes[0];
    try {
      // ⚠ UN DOSSIER NON MÉMORISÉ NE DOIT PAS DEVENIR UN MESSAGE ABANDONNÉ.
      //   Le worker enregistre l'identifiant du dossier sans faire dépendre le
      //   déplacement de cette écriture : elle peut donc manquer alors que le
      //   message, lui, est bien parti. On le retrouve par son nom, comme le
      //   worker l'a créé.
      const dossier =
        ref.dossier_service_id ??
        (await assurerDossierService(ref.tenant_id, graphUserId));

      const dansLeDossier = await listerDossierService(
        ref.tenant_id,
        graphUserId,
        dossier,
      );

      // ⚠ ON NE RENOMME QUE SI LA CORRESPONDANCE EST CERTAINE. Le dossier ne
      //   rend que des identifiants, et celui d'un message en transit n'est
      //   plus celui que la base connaît : rien ne dit lequel est lequel dès
      //   qu'il y en a deux. Renommer au hasard rattacherait une sauvegarde de
      //   corps au mauvais message — pire que ne rien faire. À plusieurs, on
      //   se contente de tout ramener en boîte de réception : le retour
      //   déclenche une notification, et le jeton `data-ref` de la bannière
      //   rattache chaque message à sa ligne, exactement.
      const certain = lignes.length === 1 && dansLeDossier.length === 1;

      for (const enTransit of dansLeDossier) {
        const revenu = await deplacerMessage(
          ref.tenant_id,
          graphUserId,
          enTransit,
          "inbox",
        );
        ramenes += 1;

        if (!certain) {
          details.push({
            boite: graphUserId,
            ramene: revenu.slice(0, 18) + "…",
            rattachement: `différé (${lignes.length} lignes, ${dansLeDossier.length} messages)`,
          });
          continue;
        }

        // Le renommage se fait sur l'ancien identifiant CONNU DE LA BASE, pas
        // sur celui qu'on vient de lire dans le dossier : entre les deux, le
        // message a déjà changé d'identifiant une fois. La fonction est
        // idempotente et ne fait rien si elle ne trouve pas — auquel cas le
        // rattachement par jeton prend le relais.
        await rpc("renommer_message_graph", {
          p_company_id: ref.company_id,
          p_ancien_id: ref.message_id,
          p_nouveau_id: revenu,
        }).catch(() => {});

        details.push({ boite: graphUserId, ramene: revenu.slice(0, 18) + "…" });
      }
    } catch (erreur) {
      const detail = messageDe(erreur);
      details.push({ boite: graphUserId, erreur: detail });
      console.error(`[maintenance] transit ${graphUserId} : ${detail}`);
    }
  }

  return { examinees: boites.size, ramenes, details };
}

/** Au-delà, on laisse le balayage finir le travail. Même seuil que le worker. */
const ESSAIS_DEPLACEMENT = 3;

/**
 * Sort le message de la boîte de réception et l'y remet, après une pose.
 *
 * ⚠ TOUTE POSE DE BANNIÈRE DOIT PASSER PAR ICI, pas seulement celle du
 *   worker. Une bannière posée par le rattrapage ou par la conversion et non
 *   suivie d'un déplacement reste invisible dans Outlook desktop sur une
 *   boîte ouverte — c'est-à-dire chez la quasi-totalité des utilisateurs. Deux
 *   des trois chemins de pose l'ignoraient, ce qui rendait la correction du
 *   11 septembre inopérante pour eux.
 *
 * Rend `null` si tout s'est bien passé, sinon la raison — qui est consignée
 * sur la ligne au passage. Ne lève jamais : l'échec du déplacement ne doit
 * pas défaire une bannière correctement posée.
 */
async function rafraichirApresPose(cible: {
  analyse_id: string;
  company_id: string;
  boite_id: string;
  tenant_id: string;
  graph_user_id: string;
  message_id: string;
}): Promise<string | null> {
  /** Le message est-il sorti de la boîte de réception ? Pas encore. */
  let sorti = false;
  const tracer = async (etat: string, note: string) => {
    await rpc("tracer_deplacement", {
      p_analyse_id: cible.analyse_id,
      p_etat: etat,
      p_note: note,
      // Tant qu'il n'est pas sorti, on libère le marqueur : le laisser
      // enverrait le balayage chercher dans le dossier de service un message
      // qui n'en a jamais bougé.
      p_sorti: sorti,
    }).catch((secondaire) => {
      console.error(`[maintenance] trace de déplacement non écrite : ${messageDe(secondaire)}`);
    });
    return note;
  };

  // ⚠ PAR L'IDENTIFIANT DE LIGNE, ET AVANT TOUT APPEL À MICROSOFT. Désigner la
  //   ligne par le message laissait l'ordre ne rien trouver, ne rien écrire et
  //   ne rien dire — le déplacement pouvait avoir lieu sans que la base suive.
  const ouverture = await rpc<string>("ouvrir_deplacement", {
    p_analyse_id: cible.analyse_id,
    p_message_id: cible.message_id,
  }).catch((erreur) => `ouverture impossible (${messageDe(erreur)})`);

  if (ouverture !== "concordant") {
    console.error(`[maintenance] ouverture du déplacement : ${ouverture}`);
  }

  let dossier: string;
  try {
    dossier = await assurerDossierService(cible.tenant_id, cible.graph_user_id);
  } catch (erreur) {
    return tracer("echec", `dossier de service : ${messageDe(erreur)}`.slice(0, 400));
  }

  await rpc("enregistrer_dossier_service", {
    p_boite_id: cible.boite_id,
    p_dossier_id: dossier,
  }).catch(() => {});

  let enTransit: string;
  try {
    enTransit = await deplacerMessage(
      cible.tenant_id,
      cible.graph_user_id,
      cible.message_id,
      dossier,
    );
  } catch (erreur) {
    return tracer("echec", `aller : ${messageDe(erreur)}`.slice(0, 400));
  }

  // À partir d'ici le message est hors de sa boîte : le marqueur reste, c'est
  // lui qui permet au balayage d'aller le rechercher.
  sorti = true;

  let dernier = "";
  for (let essai = 1; essai <= ESSAIS_DEPLACEMENT; essai += 1) {
    try {
      const revenu = await deplacerMessage(
        cible.tenant_id,
        cible.graph_user_id,
        enTransit,
        "inbox",
      );
      const renomme = await rpc<{ table_modifiee: string; lignes: number }[]>(
        "renommer_message_graph",
        {
          p_company_id: cible.company_id,
          p_ancien_id: cible.message_id,
          p_nouveau_id: revenu,
        },
      );

      // Un renommage qui ne trouve rien n'est pas un succès : le message a
      // bougé et sa sauvegarde de corps n'est plus rattachable.
      const bascules = Array.isArray(renomme)
        ? renomme.reduce((somme, ligne) => somme + (ligne?.lignes ?? 0), 0)
        : 0;

      await tracer(
        "reussi",
        bascules > 0
          ? `déplacé, ${bascules} ligne(s) renommée(s)`
          : `DÉPLACÉ SANS SUIVI : le renommage n'a trouvé aucune ligne sous ` +
            `« ${cible.message_id} ». La restauration de ce message est compromise.`,
      );
      return null;
    } catch (erreur) {
      dernier = messageDe(erreur);
      console.error(
        `[maintenance] retour en boîte de réception, essai ${essai}/${ESSAIS_DEPLACEMENT} : ${dernier}`,
      );
    }
  }

  // Le message est resté dans le dossier de service. Il y est VISIBLE, et la
  // ligne porte encore `deplacement_at` : le balayage le ramènera.
  return tracer(
    "echec",
    `retour impossible après ${ESSAIS_DEPLACEMENT} essais (${dernier}) — le balayage le ramènera`.slice(0, 400),
  );
}

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
        // ⚠ LE JETON, SANS LEQUEL LE DÉPLACEMENT QUI SUIT EST DANGEREUX. Le
        //   retour en boîte de réception fait apparaître un nouvel élément,
        //   Graph notifie, et le worker reprend le message sous un nouvel
        //   identifiant. Sans jeton, il ne le reconnaît pas et crée une
        //   SECONDE ligne : deux alertes et deux emails au dirigeant.
        ref: alerte.analyse_id,
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

      // Le déplacement vient APRÈS l'enregistrement, jamais avant : il change
      // l'identifiant du message, et `marquer_action_graph` le désigne par cet
      // identifiant. Même règle que dans le worker.
      const deplacement = await rafraichirApresPose({
        analyse_id: alerte.analyse_id,
        company_id: alerte.company_id,
        boite_id: alerte.boite_id,
        tenant_id: alerte.tenant_id,
        graph_user_id: alerte.graph_user_id,
        message_id: alerte.message_id,
      });

      details.push({
        message: alerte.message_id.slice(0, 20),
        etat: "posee",
        ...(deplacement ? { deplacement } : {}),
      });
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
  analyse_id: string;
  message_id: string;
  company_id: string;
  boite_id: string;
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
            // Le jeton : sans lui, le déplacement qui suit produirait un
            // doublon au webhook rejoué. Voir `rafraichirApresPose`.
            ref: cible.analyse_id,
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

      // Le corps vient de changer : sans déplacement, Outlook desktop continue
      // d'afficher celui qu'il a en cache — c'est-à-dire l'ancienne bannière
      // texte, ou pas de bannière du tout.
      const deplacement = await rafraichirApresPose({
        analyse_id: cible.analyse_id,
        company_id: cible.company_id,
        boite_id: cible.boite_id,
        tenant_id: cible.tenant_id,
        graph_user_id: cible.graph_user_id,
        message_id: cible.message_id,
      });

      details.push({
        message: court,
        etat: "convertie",
        ...(deplacement ? { deplacement } : {}),
      });
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


/* ==========================================================================
   Rafraîchissement des annuaires
   ========================================================================== */

/**
 * L'annuaire vieillit en silence, et c'est lui qui alimente la détection
 * d'usurpation.
 *
 * Jusqu'ici il n'était rempli qu'une fois, par un script lancé à la main au
 * raccordement. Chez un client, un dirigeant recruté ensuite n'aurait jamais
 * été reconnu — et une usurpation de son identité serait passée inaperçue,
 * sans que rien ne le signale.
 *
 * ⚠ UN ANNUAIRE VIDE NE REMPLACE RIEN. rafraichir_annuaire_graph refuse déjà
 *   une charge vide, mais on ne l'appelle même pas : un appel Graph qui rend
 *   zéro personne est un appel raté, pas une entreprise sans salariés.
 */
async function rafraichirAnnuaires(): Promise<Record<string, unknown>> {
  const locataires = await rpc<
    { tenant_uid: string; tenant_id: string; personnes: number }[]
  >("tenants_a_rafraichir", { p_age_heures: 24, p_limite: 5 });

  if (!Array.isArray(locataires) || locataires.length === 0) {
    return { examines: 0, rafraichis: 0, details: [] };
  }

  const details: Record<string, unknown>[] = [];
  let rafraichis = 0;
  const limite = Date.now() + BUDGET_MS;

  for (const l of locataires) {
    if (Date.now() > limite) break;
    try {
      const personnes = await listerAnnuaire(l.tenant_id);
      if (personnes.length === 0) {
        details.push({ tenant: l.tenant_id, etat: "vide-ignore" });
        continue;
      }
      const bilan = await rpc<{ personnes: number; domaines: number }[]>(
        "rafraichir_annuaire_graph",
        {
          p_tenant_uid: l.tenant_uid,
          p_personnes: personnes,
          p_domaines: domainesDeAnnuaire(personnes),
        },
      );
      const r = Array.isArray(bilan) ? bilan[0] : bilan;
      rafraichis += 1;
      details.push({
        tenant: l.tenant_id,
        etat: "rafraichi",
        personnes: r?.personnes ?? personnes.length,
        domaines: r?.domaines ?? 0,
      });
    } catch (erreur) {
      const detail = messageDe(erreur);
      console.error(`[maintenance] annuaire ${l.tenant_id} : ${detail}`);
      details.push({ tenant: l.tenant_id, etat: "echec", erreur: detail.slice(0, 200) });
    }
  }

  return { examines: locataires.length, rafraichis, details };
}

function autorise(request: Request): boolean {
  const attendu = process.env.WORKER_SECRET;
  if (!attendu) return false;
  const fourni =
    request.headers.get("x-safentreprise-worker") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return fourni === attendu;
}

async function postInterne(request: Request) {
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

    // Cinquième travail : rafraîchir les annuaires qui vieillissent.
    try {
      resultat.annuaires = await rafraichirAnnuaires();
    } catch (erreur) {
      resultat.annuaires = { erreur: messageDe(erreur) };
      console.error("[maintenance] annuaires :", messageDe(erreur));
    }

    // Sixième travail, et c'est celui qui tient une promesse faite au client :
    // aucun message ne doit rester dans le dossier de service. Il passe en
    // dernier parce qu'il est le moins urgent, mais il passe toujours.
    try {
      resultat.transit = await ramenerMessagesEnTransit();
    } catch (erreur) {
      resultat.transit = { erreur: messageDe(erreur) };
      console.error("[maintenance] transit :", messageDe(erreur));
    }
  }

  return Response.json(resultat);
}

export async function GET(request: Request) {
  return POST(request);
}

/**
 * Tout accès déclenché par cette route est attribué à « maintenance ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function POST(request: Request) {
  return avecContexteJournal(
    { acteur: "maintenance", tache: "taches-de-nuit" },
    () => postInterne(request),
  );
}
