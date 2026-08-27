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
  renouvelerAbonnement,
} from "@/lib/microsoft/graph";

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

  return Response.json(resultat);
}

export async function GET(request: Request) {
  return POST(request);
}
