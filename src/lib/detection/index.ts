/**
 * Adaptateur : rend le moteur de détection utilisable depuis le serveur.
 *
 * Le moteur (detection-rules.js) est écrit pour un content script Chrome :
 * c'est une fonction anonyme qui s'exécute immédiatement et accroche son API
 * à `window` ou à `self`. Ni l'un ni l'autre n'existe dans Node, donc un
 * simple `import` du fichier échoue avec « self is not defined ».
 *
 * On pose donc `self` avant de le charger, exactement comme le font les tests
 * de l'extension. L'import doit être DYNAMIQUE : un `import` statique serait
 * hissé en haut du module et s'exécuterait avant notre préparation.
 *
 * Le fichier lui-même n'est pas modifié : il reste chargeable tel quel par
 * l'extension.
 */

/** Ce que le moteur reçoit. */
export type EntreeAnalyse = {
  nomAffiche?: string;
  email?: string;
  objet?: string;
  corps?: string;
};

/** Ce que le moteur renvoie (champs utilisés côté serveur). */
export type Verdict = {
  score: number;
  /** « faible » | « modéré » | « élevé » — avec accents. */
  niveau: string;
  alerte: boolean;
  /** Phrases explicatives, destinées à l'affichage. */
  signaux: string[];
  /** Codes courts, destinés aux statistiques. */
  raisons?: string[];
  /** Nom trouvé en signature, s'il y en a un. */
  nomSignature?: string | null;
  /** Nom affiché par l'expéditeur. */
  nomExpediteur?: string | null;
  /** Celui des deux que le moteur a retenu pour son raisonnement. */
  nomRetenu?: string | null;
};

/**
 * Faits que le moteur ne peut pas établir seul.
 *
 * Il ne va JAMAIS les chercher : c'est l'appelant qui les fournit, ce qui lui
 * permet de rester sans entrée/sortie et chargeable dans un navigateur.
 * Omis, le verdict est celui du moteur nu.
 */
export type ContexteDetection = {
  /** Domaines réellement possédés par l'entreprise. */
  domainesInternes?: string[];
  /** Tiers légitimes : routeurs d'emailing, filiales, partenaires. */
  domainesAutorises?: string[];
  /** Instantané de l'annuaire. */
  annuaire?: { nom: string; email?: string | null }[];
};

type ApiMoteur = {
  analyserEmail: (
    entree: EntreeAnalyse,
    contexte?: ContexteDetection,
  ) => Verdict;
  setDebug: (valeur: boolean) => void;
};

/** Chargé une seule fois par instance. */
let moteur: Promise<ApiMoteur> | null = null;

function chargerMoteur(): Promise<ApiMoteur> {
  if (moteur) return moteur;

  moteur = (async () => {
    const global = globalThis as unknown as Record<string, unknown>;
    if (typeof global.self === "undefined") {
      global.self = global;
    }

    await import("./detection-rules.js");

    const porteur = (global.self ?? global) as Record<string, unknown>;
    const api = porteur.SafentrepriseGuard as ApiMoteur | undefined;
    if (!api?.analyserEmail) {
      throw new Error(
        "Moteur de détection introuvable après chargement de detection-rules.js",
      );
    }

    // Le moteur journalise chaque analyse en console : inutile côté serveur.
    api.setDebug(false);
    return api;
  })();

  return moteur;
}

/** Niveaux tels que les accepte la base (contrainte CHECK sans accents). */
const NIVEAUX_BASE: Record<string, "faible" | "modere" | "eleve"> = {
  faible: "faible",
  "modéré": "modere",
  "élevé": "eleve",
};

export type VerdictServeur = Verdict & {
  /** Niveau normalisé pour menaces_detectees. */
  niveauBase: "faible" | "modere" | "eleve";
};

/** Analyse un message et renvoie le verdict, niveau normalisé compris. */
export async function analyser(
  entree: EntreeAnalyse,
  contexte?: ContexteDetection,
): Promise<VerdictServeur> {
  const api = await chargerMoteur();
  const verdict = api.analyserEmail(entree, contexte);

  return {
    ...verdict,
    niveauBase: NIVEAUX_BASE[verdict.niveau] ?? "faible",
  };
}
