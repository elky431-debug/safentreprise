/**
 * Worker : draine la file des notifications Graph.
 *
 * Pour chaque message en attente : le récupérer, convertir son corps en
 * texte, l'analyser, écrire le verdict. **Il ne touche pas au message.**
 * Poser une catégorie et injecter une bannière viendra ensuite, une fois les
 * scores observés sur de vrais messages — un faux positif défigure
 * définitivement un mail légitime, ce droit-là se donne les yeux ouverts.
 *
 * Déclenchement : appel HTTP protégé par un secret partagé. La tâche
 * planifiée qui l'appellera toutes les minutes viendra avec le renouvellement
 * des abonnements ; en attendant, on l'appelle à la main.
 *
 * Contrairement au webhook, cette route peut prendre son temps et importe ce
 * dont elle a besoin. Elle reste bornée pour tenir sous le délai de Netlify :
 * un lot court, un budget, et le reste au tour suivant.
 */
import { analyser } from "@/lib/detection";
import { ErreurGraph, lireMessage } from "@/lib/microsoft/graph";
import { convertirCorps } from "@/lib/detection/html-texte.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Au-delà, on rend la main et le reste attend le tour suivant. */
const BUDGET_MS = 20_000;
const LOT = 5;

type Travail = {
  travail_id: string;
  company_id: string;
  boite_id: string;
  message_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
  tentatives: number;
};

/** Faits d'entreprise passés au moteur. Voir `normaliserContexte`. */
type ContexteDetection = {
  domainesInternes: string[];
  domainesAutorises: string[];
  annuaire: { nom: string; email: string | null }[];
};

/* ==========================================================================
   Base
   ========================================================================== */

/**
 * Appel d'une fonction Postgres avec la clé de service.
 *
 * Les fonctions du worker lisent des métadonnées de messages et modifient la
 * file : elles ne sont volontairement pas accessibles avec la clé anonyme.
 */
async function rpc<T>(nom: string, parametres: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent de l'environnement.",
    );
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

  if (!reponse.ok) {
    const detail = await reponse.text();
    throw new Error(`${nom} : HTTP ${reponse.status} — ${detail.slice(0, 300)}`);
  }

  return (await reponse.json()) as T;
}

/* ==========================================================================
   Traitement d'un message
   ========================================================================== */

type Resultat = {
  message_id: string;
  statut: "analyse" | "ignore" | "echec";
  niveau?: string;
  score?: number;
  alerte?: boolean;
  motif?: string;
};

/**
 * Contexte d'entreprise, mis en cache le temps de l'exécution.
 *
 * Un lot porte souvent plusieurs messages de la même société : inutile de
 * redemander l'annuaire à chaque fois. Le cache ne vit QUE le temps de
 * l'invocation — pas de risque de servir à une société le contexte d'une
 * autre entre deux appels.
 */
async function contextePour(
  companyId: string,
  cache: Map<string, ContexteDetection | null>,
): Promise<ContexteDetection | undefined> {
  if (!cache.has(companyId)) {
    try {
      cache.set(
        companyId,
        await rpc<ContexteDetection>("contexte_detection_graph", {
          p_company_id: companyId,
        }),
      );
    } catch (erreur) {
      // Sans contexte le moteur reste opérant : il perd la détection de
      // typosquattage et d'usurpation, pas le reste. Mieux vaut un verdict
      // partiel qu'un message non analysé.
      console.error("[worker] contexte indisponible :", erreur);
      cache.set(companyId, null);
    }
  }

  const contexte = cache.get(companyId);
  // Un contexte sans domaine interne n'apprend rien au moteur et l'exposerait
  // à conclure sur du vide : on préfère ne rien passer du tout.
  if (!contexte || contexte.domainesInternes.length === 0) return undefined;
  return contexte;
}

async function traiter(
  travail: Travail,
  contexte: ContexteDetection | undefined,
): Promise<Resultat> {
  const debut = Date.now();

  const message = await lireMessage(
    travail.tenant_id,
    travail.graph_user_id,
    travail.message_id,
  );

  // Un brouillon n'a pas été reçu : rien à analyser.
  if (message.isDraft) {
    await rpc("echec_travail_graph", {
      p_travail_id: travail.travail_id,
      p_erreur: "brouillon, ignoré",
      p_definitif: true,
    });
    return { message_id: travail.message_id, statut: "ignore", motif: "brouillon" };
  }

  // Conversion du corps. C'est elle qui rend la signature trouvable : sur du
  // HTML brut, le moteur ne lit que des balises de fermeture.
  const corps = convertirCorps(message.body?.content ?? "", {
    format: message.body?.contentType === "text" ? "text" : "auto",
  });

  const verdict = await analyser(
    {
      nomAffiche: message.from?.emailAddress?.name ?? "",
      email: message.from?.emailAddress?.address ?? "",
      objet: message.subject ?? "",
      corps: corps.texte,
    },
    contexte,
  );

  await rpc("enregistrer_analyse_graph", {
    p_travail_id: travail.travail_id,
    p_expediteur_nom: message.from?.emailAddress?.name ?? null,
    p_expediteur_email: message.from?.emailAddress?.address ?? null,
    p_nom_signe: verdict.nomSignature ?? verdict.nomRetenu ?? null,
    p_objet: message.subject ?? null,
    p_employe_email:
      message.toRecipients?.[0]?.emailAddress?.address ?? travail.upn,
    p_recu_at: message.receivedDateTime ?? null,
    p_score: verdict.score,
    p_niveau: verdict.niveauBase,
    p_alerte: verdict.alerte,
    p_signaux: verdict.signaux ?? [],
    p_raisons: verdict.raisons ?? [],
    p_citation_retiree: corps.citationRetiree,
    p_marqueur_citation: corps.marqueurCitation,
    p_blocs_masques: corps.blocsMasques,
    p_invisibles_retires: corps.invisiblesRetires,
    p_format_corps: corps.format,
    p_longueur_texte: corps.texte.length,
    p_duree_ms: Date.now() - debut,
  });

  return {
    message_id: travail.message_id,
    statut: "analyse",
    niveau: verdict.niveau,
    score: verdict.score,
    alerte: verdict.alerte,
  };
}

/* ==========================================================================
   Point d'entrée
   ========================================================================== */

async function executer(): Promise<Response> {
  const travaux = await rpc<Travail[]>("reclamer_travaux_graph", {
    p_limite: LOT,
  });

  if (!Array.isArray(travaux) || travaux.length === 0) {
    return Response.json({ traites: 0, resultats: [] });
  }

  const resultats: Resultat[] = [];
  const echeance = Date.now() + BUDGET_MS;
  const contextes = new Map<string, ContexteDetection | null>();

  for (const travail of travaux) {
    if (Date.now() > echeance) {
      // On rend la main : les travaux non traités repassent en attente
      // au bout de dix minutes, ou dès le prochain tour si le lot est vide.
      await rpc("echec_travail_graph", {
        p_travail_id: travail.travail_id,
        p_erreur: "budget de temps dépassé, repris au tour suivant",
        p_definitif: false,
      });
      continue;
    }

    try {
      const contexte = await contextePour(travail.company_id, contextes);
      resultats.push(await traiter(travail, contexte));
    } catch (erreur) {
      const graph = erreur instanceof ErreurGraph ? erreur : null;
      const detail = erreur instanceof Error ? erreur.message : String(erreur);

      console.error(
        `[worker] ${travail.message_id} : ${detail}`,
        graph ? `(HTTP ${graph.statut}, ${graph.code})` : "",
      );

      await rpc("echec_travail_graph", {
        p_travail_id: travail.travail_id,
        p_erreur: detail,
        // Un message supprimé, une permission manquante : inutile d'insister.
        p_definitif: graph ? !graph.reessayable : false,
      });

      resultats.push({
        message_id: travail.message_id,
        statut: "echec",
        motif: detail.slice(0, 200),
      });
    }
  }

  return Response.json({
    traites: resultats.filter((r) => r.statut === "analyse").length,
    resultats,
  });
}

/** Le secret partagé protège le déclenchement. */
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
  if (!autorise(request)) {
    return new Response("non autorisé", { status: 401 });
  }

  try {
    return await executer();
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("[worker] échec global :", detail);
    return Response.json({ erreur: detail }, { status: 500 });
  }
}

/** Même traitement en GET, pour pouvoir déclencher depuis un navigateur. */
export async function GET(request: Request) {
  return POST(request);
}
