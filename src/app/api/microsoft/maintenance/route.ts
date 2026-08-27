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
  contientBanniere,
  poserBanniere,
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
   Renouvellement
   ========================================================================== */

async function renouveler(): Promise<Record<string, unknown>> {
  const abonnements = await rpc<Abonnement[]>("abonnements_a_renouveler", {
    p_marge_heures: MARGE_HEURES,
  });

  if (!Array.isArray(abonnements) || abonnements.length === 0) {
    return { examines: 0, renouveles: 0, recrees: 0, echecs: 0, details: [] };
  }

  const details: Record<string, unknown>[] = [];
  let renouveles = 0;
  let recrees = 0;
  let echecs = 0;

  const notificationUrl = process.env.GRAPH_NOTIFICATION_URL;

  for (const abonnement of abonnements) {
    const expiration = new Date(Date.now() + DUREE_MINUTES * 60_000).toISOString();

    try {
      // « perdu » : Microsoft l'a supprimé. Le renouveler renverrait 404 —
      // il faut en créer un nouveau.
      if (abonnement.statut === "perdu") {
        if (!notificationUrl) {
          throw new Error(
            "GRAPH_NOTIFICATION_URL absent : impossible de recréer l'abonnement.",
          );
        }
        const cree = await creerAbonnement(
          abonnement.tenant_id,
          abonnement.graph_user_id,
          notificationUrl,
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
        });
        recrees += 1;
        details.push({ upn: abonnement.upn, action: "recree", expire: cree.expirationDateTime });
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
      });
      renouveles += 1;
      details.push({ upn: abonnement.upn, action: "renouvele", expire: maj.expirationDateTime });
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

      if (message.body?.contentType === "text") {
        await rpc("marquer_action_graph", {
          p_company_id: alerte.company_id,
          p_message_id: alerte.message_id,
          p_categorie: null,
          p_banniere_posee: false,
          p_erreur: null,
          p_action_etat: "ignoree-texte",
        });
        details.push({ message: alerte.message_id.slice(0, 20), etat: "ignoree-texte" });
        continue;
      }

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

      const banniere = construireBanniere({
        niveau: alerte.niveau,
        score: alerte.score,
        signaux: Array.isArray(alerte.signaux) ? alerte.signaux : [],
      });

      await remplacerCorps(
        alerte.tenant_id,
        alerte.graph_user_id,
        alerte.message_id,
        poserBanniere(origine, banniere),
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
      resultat.abonnements = await renouveler();
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
  }

  return Response.json(resultat);
}

export async function GET(request: Request) {
  return POST(request);
}
