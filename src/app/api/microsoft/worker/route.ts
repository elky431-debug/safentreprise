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
import {
  ErreurGraph,
  assurerCategorie,
  lireMessage,
  obtenirJeton,
  poserCategorie,
  remplacerCorps,
} from "@/lib/microsoft/graph";
import {
  construireBanniere,
  contientBanniere,
  poserBanniere,
  type NiveauBanniere,
} from "@/lib/microsoft/banniere";
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
 * Erreur portant l'étape où elle s'est produite.
 *
 * Sans ça, une panne se présente comme un message nu — « Unexpected end of
 * JSON input » — sans dire quel appel a échoué. L'étape est ce qui manque pour
 * diagnostiquer depuis la seule réponse HTTP, sans accès aux journaux.
 */
class ErreurEtape extends Error {
  constructor(
    message: string,
    readonly etape: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ErreurEtape";
  }
}

function etapeDe(erreur: unknown): string {
  return erreur instanceof ErreurEtape ? erreur.etape : "inconnue";
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

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
    throw new ErreurEtape(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent de l'environnement.",
      "configuration",
    );
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${url}/rest/v1/rpc/${nom}`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parametres),
    });
  } catch (erreur) {
    throw new ErreurEtape(
      `${nom} : impossible de joindre PostgREST — ${messageDe(erreur)}`,
      `rpc:${nom}`,
      erreur,
    );
  }

  const texte = await reponse.text();

  if (!reponse.ok) {
    throw new ErreurEtape(
      `${nom} : HTTP ${reponse.status} — ${texte.slice(0, 300)}`,
      `rpc:${nom}`,
    );
  }

  // Une fonction qui RETURNS VOID — echec_travail_graph — fait répondre
  // PostgREST sans corps. Faire JSON.parse dessus lève « Unexpected end of
  // JSON input », un message qui ne dit ni quel appel ni quelle étape.
  if (texte.trim() === "") return null as T;

  try {
    return JSON.parse(texte) as T;
  } catch {
    throw new ErreurEtape(
      `${nom} : réponse illisible (HTTP ${reponse.status}) — ${texte.slice(0, 200)}`,
      `rpc:${nom}`,
    );
  }
}

/**
 * Signale l'échec d'un travail sans jamais masquer l'erreur d'origine.
 *
 * Ce compte rendu est appelé DEPUIS un bloc catch. S'il lève à son tour,
 * l'exception remplace celle qu'on était en train de traiter et la vraie cause
 * disparaît — c'est exactement ce qui rendait la panne indéchiffrable.
 */
async function signalerEchec(
  travailId: string,
  erreur: string,
  definitif: boolean,
): Promise<string | null> {
  try {
    await rpc("echec_travail_graph", {
      p_travail_id: travailId,
      p_erreur: erreur,
      p_definitif: definitif,
    });
    return null;
  } catch (secondaire) {
    const detail = messageDe(secondaire);
    console.error(`[worker] compte rendu d'échec impossible : ${detail}`);
    return detail;
  }
}

/* ==========================================================================
   Action sur le message
   ========================================================================== */

/**
 * Interrupteur d'écriture. DÉSACTIVÉ PAR DÉFAUT.
 *
 *   off       — on n'écrit rien. Le worker analyse et enregistre, comme avant.
 *   categorie — pose seulement la catégorie. Réversible d'un clic par
 *               l'utilisateur lui-même, et ne modifie pas le message.
 *   complet   — catégorie ET bannière dans le corps.
 *
 * Il est à « off » tant que personne ne l'a explicitement changé : déployer ce
 * code ne modifie donc aucune boîte. C'est voulu — la bannière est la seule
 * opération irréversible du produit, elle ne doit jamais s'activer par le
 * simple fait d'une mise en ligne.
 */
function modeAction(): "off" | "categorie" | "complet" {
  const valeur = (process.env.GRAPH_ACTIONS ?? "off").trim().toLowerCase();
  return valeur === "complet" || valeur === "categorie" ? valeur : "off";
}

type Action = {
  mode: string;
  categorie?: {
    etat: "posee" | "echec";
    nom?: string;
    /** Sans la liste maîtresse, la catégorie s'affiche sans couleur. */
    couleur?: "declaree" | "sans-couleur";
    erreur?: string;
  };
  banniere?: {
    etat:
      | "posee"
      | "echec"
      | "ignoree-texte"
      | "deja-presente"
      | "annulee-non-verifiable";
    erreur?: string;
  };
  /**
   * L'action a réussi mais n'a pas pu être consignée en base. C'est grave :
   * sans trace, graph:restaurer ne saura pas qu'il y a quelque chose à
   * défaire sur ce message.
   */
  enregistrement?: string;
};

/**
 * Pose la catégorie et, selon le mode, la bannière.
 *
 * ⚠ JAMAIS RIEN QUAND IL N'Y A PAS D'ALERTE. Pas de catégorie « analysé »,
 *   pas de pastille verte : on n'affiche que le risque. Une marque d'absence
 *   de risque vaudrait caution, y compris sur les messages que le worker n'a
 *   jamais vus.
 */
async function agir(
  travail: Travail,
  message: { id: string; categories?: string[]; body?: { contentType?: string; content?: string } },
  verdict: { alerte: boolean; niveauBase: string; score: number; signaux: string[] },
): Promise<Action> {
  const mode = modeAction();
  if (mode === "off") return { mode: "off" };
  if (!verdict.alerte) return { mode };

  const action: Action = { mode };

  // ─────────────────────────────────────────────────────────────────────
  // LES DEUX ACTIONS SONT INDÉPENDANTES.
  //
  // La catégorie est un confort de tri ; la bannière est l'avertissement
  // que l'utilisateur lira. Laisser la première empêcher la seconde revient
  // à ne pas prévenir quelqu'un d'une tentative de fraude parce qu'on n'a
  // pas pu colorier une pastille. Chacune a donc son propre try/catch, et
  // aucune ne peut interrompre l'autre.
  // ─────────────────────────────────────────────────────────────────────

  try {
    const categorie = await etape("création de la catégorie", () =>
      assurerCategorie(travail.tenant_id, travail.graph_user_id, verdict.niveauBase),
    );

    await etape("pose de la catégorie", () =>
      poserCategorie(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        message.categories ?? [],
        categorie.nom,
      ),
    );

    action.categorie = {
      etat: "posee",
      nom: categorie.nom,
      couleur: categorie.enregistree ? "declaree" : "sans-couleur",
      erreur: categorie.motif,
    };
  } catch (erreur) {
    console.error(
      `[worker] catégorie impossible sur ${travail.message_id} : ${messageDe(erreur)}`,
    );
    action.categorie = { etat: "echec", erreur: messageDe(erreur) };
  }

  if (mode === "categorie") return action;

  try {
    action.banniere = await poserBanniereSurMessage(travail, message, verdict);
  } catch (erreur) {
    console.error(
      `[worker] bannière impossible sur ${travail.message_id} — ` +
        `étape « ${etapeDe(erreur)} » : ${messageDe(erreur)}`,
    );
    action.banniere = { etat: "echec", erreur: messageDe(erreur) };
  }

  return action;
}

/** Pose la bannière et vérifie qu'on saurait la retirer. */
async function poserBanniereSurMessage(
  travail: Travail,
  message: { body?: { contentType?: string; content?: string } },
  verdict: { niveauBase: string; score: number; signaux: string[] },
): Promise<NonNullable<Action["banniere"]>> {
  const origine = message.body?.content ?? "";

  // Un corps en texte brut afficherait les balises telles quelles. On s'en
  // tient à la catégorie plutôt que de convertir le message en HTML, ce qui
  // le transformerait bien au-delà de l'ajout d'un avertissement.
  if (message.body?.contentType === "text") {
    return { etat: "ignoree-texte" };
  }

  if (contientBanniere(origine)) {
    return { etat: "deja-presente" };
  }

  const banniere = construireBanniere({
    niveau: verdict.niveauBase as NiveauBanniere,
    score: verdict.score,
    signaux: verdict.signaux ?? [],
  });

  await etape("pose de la bannière", () =>
    remplacerCorps(
      travail.tenant_id,
      travail.graph_user_id,
      travail.message_id,
      poserBanniere(origine, banniere),
    ),
  );

  // ─────────────────────────────────────────────────────────────────────
  // VÉRIFICATION APRÈS ÉCRITURE.
  //
  // Exchange normalise le HTML qu'on lui envoie. S'il retire nos marqueurs
  // ET notre balise repère, la bannière devient indélébile : on n'a aucune
  // copie du corps d'origine à réécrire. On relit donc ce qui a réellement
  // été enregistré et on vérifie qu'on saurait le défaire.
  //
  // Si ce n'est pas le cas, l'original est encore en mémoire À CET INSTANT
  // et nulle part ailleurs : c'est la seule fenêtre où l'annulation reste
  // possible. On la saisit.
  // ─────────────────────────────────────────────────────────────────────
  const relu = await etape("relecture après pose", () =>
    lireMessage(travail.tenant_id, travail.graph_user_id, travail.message_id),
  );

  if (!contientBanniere(relu.body?.content ?? "")) {
    await etape("annulation de la bannière non vérifiable", () =>
      remplacerCorps(
        travail.tenant_id,
        travail.graph_user_id,
        travail.message_id,
        origine,
      ),
    );
    return {
      etat: "annulee-non-verifiable",
      erreur:
        "La bannière n'était plus retrouvable après écriture : Exchange a " +
        "retiré les marqueurs ET la balise repère. Corps d'origine rétabli.",
    };
  }

  return { etat: "posee" };
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
  /** Où ça a cassé. Vide quand tout s'est bien passé. */
  etape?: string;
  /** Renseigné si le compte rendu d'échec a lui aussi échoué. */
  echecSecondaire?: string;
  /** Le contexte d'entreprise a-t-il pu être appliqué ? */
  contexte?: "applique" | "absent";
  /** Ce qui a été posé sur le message, le cas échéant. */
  action?: Action;
};

/** Exécute une étape en lui attachant son nom en cas d'échec. */
async function etape<T>(nom: string, action: () => Promise<T> | T): Promise<T> {
  try {
    return await action();
  } catch (erreur) {
    if (erreur instanceof ErreurEtape) throw erreur;
    throw new ErreurEtape(messageDe(erreur), nom, erreur);
  }
}

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

  const message = await etape("lecture du message (Graph)", () =>
    lireMessage(travail.tenant_id, travail.graph_user_id, travail.message_id),
  );

  // Un brouillon n'a pas été reçu : rien à analyser.
  if (message.isDraft) {
    const secondaire = await signalerEchec(
      travail.travail_id,
      "brouillon, ignoré",
      true,
    );
    return {
      message_id: travail.message_id,
      statut: "ignore",
      motif: "brouillon",
      echecSecondaire: secondaire ?? undefined,
    };
  }

  // Conversion du corps. C'est elle qui rend la signature trouvable : sur du
  // HTML brut, le moteur ne lit que des balises de fermeture.
  const corps = await etape("conversion du corps", () =>
    convertirCorps(message.body?.content ?? "", {
      format: message.body?.contentType === "text" ? "text" : "auto",
    }),
  );

  const verdict = await etape("analyse (moteur de détection)", () =>
    analyser(
      {
        nomAffiche: message.from?.emailAddress?.name ?? "",
        email: message.from?.emailAddress?.address ?? "",
        objet: message.subject ?? "",
        corps: corps.texte,
      },
      contexte,
    ),
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

  // L'action vient APRÈS l'enregistrement du verdict, jamais avant : si elle
  // échoue, on garde la trace de ce qu'on a décidé. L'inverse laisserait un
  // message modifié sans qu'aucune ligne n'en témoigne — donc impossible à
  // retrouver pour le défaire.
  let action: Action = { mode: modeAction() };
  try {
    action = await agir(travail, message, verdict);

    const categoriePosee =
      action.categorie?.etat === "posee" ? (action.categorie.nom ?? null) : null;
    const bannierePosee = action.banniere?.etat === "posee";

    // On enregistre dès qu'une trace existe — y compris un échec seul, pour
    // qu'il soit visible en base sans avoir à fouiller les journaux.
    const erreurs = [action.categorie?.erreur, action.banniere?.erreur]
      .filter(Boolean)
      .join(" | ");

    if (categoriePosee || bannierePosee || erreurs) {
      await rpc("marquer_action_graph", {
        p_company_id: travail.company_id,
        p_message_id: travail.message_id,
        p_categorie: categoriePosee,
        p_banniere_posee: bannierePosee,
        p_erreur: erreurs ? erreurs.slice(0, 500) : null,
      });
    }
  } catch (erreur) {
    // Une action ratée ne doit pas faire retenter l'analyse : le verdict est
    // écrit, et rejouer poserait la catégorie deux fois.
    const detail = messageDe(erreur);
    console.error(
      `[worker] action impossible sur ${travail.message_id} — ` +
        `étape « ${etapeDe(erreur)} » : ${detail}`,
    );
    // `agir` isole déjà chaque action et ne lève pas : arriver ici veut dire
    // que c'est l'ENREGISTREMENT qui a échoué, pas l'action elle-même. On
    // garde donc ce qu'`agir` a renvoyé — l'écraser ferait disparaître le
    // fait qu'une bannière a bel et bien été posée, et donc la trace
    // permettant de la retirer.
    action = { ...action, enregistrement: detail };
    await rpc("marquer_action_graph", {
      p_company_id: travail.company_id,
      p_message_id: travail.message_id,
      p_categorie: null,
      p_banniere_posee: false,
      p_erreur: `[${etapeDe(erreur)}] ${detail}`.slice(0, 500),
    }).catch(() => {});
  }

  return {
    message_id: travail.message_id,
    statut: "analyse",
    niveau: verdict.niveau,
    score: verdict.score,
    alerte: verdict.alerte,
    contexte: contexte ? "applique" : "absent",
    action,
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
      await signalerEchec(
        travail.travail_id,
        "budget de temps dépassé, repris au tour suivant",
        false,
      );
      continue;
    }

    try {
      const contexte = await contextePour(travail.company_id, contextes);
      resultats.push(await traiter(travail, contexte));
    } catch (erreur) {
      const graph = erreur instanceof ErreurGraph ? erreur : null;
      const detail = messageDe(erreur);
      const ou = etapeDe(erreur);

      console.error(
        `[worker] ${travail.message_id} — étape « ${ou} » : ${detail}`,
        graph ? `(HTTP ${graph.statut}, ${graph.code})` : "",
      );

      // signalerEchec avale ses propres pannes : sans ça, une erreur ici
      // remplacerait celle qu'on est en train de traiter.
      const secondaire = await signalerEchec(
        travail.travail_id,
        `[${ou}] ${detail}`,
        // Un message supprimé, une permission manquante : inutile d'insister.
        graph ? !graph.reessayable : false,
      );

      resultats.push({
        message_id: travail.message_id,
        statut: "echec",
        etape: ou,
        motif: detail.slice(0, 300),
        echecSecondaire: secondaire ?? undefined,
      });
    }
  }

  return Response.json({
    traites: resultats.filter((r) => r.statut === "analyse").length,
    echecs: resultats.filter((r) => r.statut === "echec").length,
    resultats,
  });
}

/* ==========================================================================
   Diagnostic
   ========================================================================== */

type Controle = { controle: string; etat: "ok" | "échec"; detail: string };

/**
 * Vérifie chaque dépendance, une par une, SANS TOUCHER À LA FILE.
 *
 * Quand le worker répond par une erreur, il est impossible de savoir depuis
 * l'extérieur laquelle de ses cinq dépendances a lâché : variables
 * d'environnement, PostgREST, les trois fonctions Postgres, le jeton Graph,
 * l'annuaire. Ce mode les prend dans l'ordre et dit laquelle casse.
 *
 * Aucun travail n'est réclamé, aucun message lu, aucune ligne modifiée : on
 * peut le lancer autant de fois qu'on veut, y compris en production.
 */
async function diagnostiquer(): Promise<Response> {
  const controles: Controle[] = [];
  const ajouter = (controle: string, etat: "ok" | "échec", detail: string) =>
    controles.push({ controle, etat, detail });

  // 1. Environnement. On ne révèle JAMAIS les valeurs, seulement la présence.
  const requises = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "WORKER_SECRET",
    "MS_CLIENT_ID",
    "MS_CLIENT_SECRET",
  ];
  const absentes = requises.filter((v) => !process.env[v]);

  ajouter(
    "mode d'action (GRAPH_ACTIONS)",
    "ok",
    modeAction() === "off"
      ? "off — aucune écriture dans les boîtes"
      : `${modeAction()} — LE WORKER ÉCRIT DANS LES BOÎTES`,
  );
  ajouter(
    "variables d'environnement",
    absentes.length === 0 ? "ok" : "échec",
    absentes.length === 0
      ? `${requises.length} présentes`
      : `absentes : ${absentes.join(", ")}`,
  );

  if (absentes.includes("NEXT_PUBLIC_SUPABASE_URL") || absentes.includes("SUPABASE_SECRET_KEY")) {
    return Response.json({ diagnostic: controles }, { status: 500 });
  }

  // 2. Les trois fonctions du worker répondent-elles ?
  //    On les appelle avec des paramètres inoffensifs : un UUID nul ne
  //    correspond à aucun travail, donc rien n'est modifié.
  const NUL = "00000000-0000-0000-0000-000000000000";

  for (const [nom, parametres, attendu] of [
    ["contexte_detection_graph", { p_company_id: NUL }, "objet JSON"],
    ["echec_travail_graph", { p_travail_id: NUL, p_erreur: "diagnostic", p_definitif: false }, "corps vide (RETURNS VOID)"],
  ] as const) {
    try {
      const r = await rpc<unknown>(nom, parametres);
      ajouter(
        `fonction ${nom}`,
        "ok",
        `répond — ${attendu}${r === null ? ", corps vide comme prévu" : ""}`,
      );
    } catch (erreur) {
      ajouter(`fonction ${nom}`, "échec", messageDe(erreur));
    }
  }

  // 3. État de la file, par simple lecture.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.SUPABASE_SECRET_KEY as string;
    const r = await fetch(
      `${url}/rest/v1/graph_file_attente?select=statut&limit=200`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
    );
    const lignes = (await r.json()) as { statut: string }[];
    const parStatut: Record<string, number> = {};
    for (const l of lignes) parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
    ajouter(
      "file d'attente",
      "ok",
      Object.keys(parStatut).length
        ? Object.entries(parStatut).map(([s, n]) => `${s}: ${n}`).join(", ")
        : "vide",
    );
  } catch (erreur) {
    ajouter("file d'attente", "échec", messageDe(erreur));
  }

  // 4. Locataires raccordés, et jeton Graph pour chacun.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.SUPABASE_SECRET_KEY as string;
    const r = await fetch(
      `${url}/rest/v1/microsoft_tenants?select=tenant_id,company_id,statut&statut=eq.actif`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
    );
    const locataires = (await r.json()) as {
      tenant_id: string;
      company_id: string;
    }[];

    ajouter(
      "locataires actifs",
      locataires.length > 0 ? "ok" : "échec",
      locataires.length > 0
        ? `${locataires.length} — ${locataires.map((l) => l.tenant_id).join(", ")}`
        : "aucun : lancer npm run graph:abonner",
    );

    for (const locataire of locataires) {
      try {
        await obtenirJeton(locataire.tenant_id);
        ajouter(`jeton Graph ${locataire.tenant_id}`, "ok", "obtenu");
      } catch (erreur) {
        ajouter(`jeton Graph ${locataire.tenant_id}`, "échec", messageDe(erreur));
      }

      try {
        const contexte = await rpc<ContexteDetection>(
          "contexte_detection_graph",
          { p_company_id: locataire.company_id },
        );
        const interne = contexte?.domainesInternes?.length ?? 0;
        ajouter(
          `contexte société ${locataire.company_id.slice(0, 8)}`,
          interne > 0 ? "ok" : "échec",
          interne > 0
            ? `${interne} domaine(s) interne(s), ` +
              `${contexte.domainesAutorises.length} autorisé(s), ` +
              `${contexte.annuaire.length} personne(s)`
            : "aucun domaine interne — le moteur tournera SANS détection de " +
              "typosquattage ni d'usurpation. Lancer npm run graph:annuaire.",
        );
      } catch (erreur) {
        ajouter(
          `contexte société ${locataire.company_id.slice(0, 8)}`,
          "échec",
          messageDe(erreur),
        );
      }
    }
  } catch (erreur) {
    ajouter("locataires actifs", "échec", messageDe(erreur));
  }

  const echecs = controles.filter((c) => c.etat === "échec");
  return Response.json(
    {
      resume: echecs.length === 0
        ? `${controles.length} contrôles, tout est vert`
        : `${echecs.length} contrôle(s) en échec : ${echecs.map((c) => c.controle).join(", ")}`,
      diagnostic: controles,
    },
    { status: echecs.length === 0 ? 200 : 500 },
  );
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

  // ?verifier=1 — contrôle les dépendances sans rien consommer.
  if (new URL(request.url).searchParams.has("verifier")) {
    return diagnostiquer();
  }

  try {
    return await executer();
  } catch (erreur) {
    const detail = messageDe(erreur);
    const ou = etapeDe(erreur);
    console.error(`[worker] échec global — étape « ${ou} » : ${detail}`);
    return Response.json(
      {
        erreur: detail,
        etape: ou,
        indice:
          "Lancer le même appel avec ?verifier=1 pour contrôler chaque " +
          "dépendance sans toucher à la file.",
      },
      { status: 500 },
    );
  }
}

/** Même traitement en GET, pour pouvoir déclencher depuis un navigateur. */
export async function GET(request: Request) {
  return POST(request);
}
