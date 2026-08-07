/**
 * Auto-évaluation du risque de fraude au virement (étape 2 de l'onboarding).
 *
 * Principe : 9 questions réparties en 3 catégories (procédures, humain,
 * technique). Chaque réponse porte un poids de risque :
 *   0 = pratique sûre, 2 = pratique partielle, 3 = pratique à risque.
 *
 * Les scores produits sont des POURCENTAGES DE RISQUE, et non des notes :
 * 0 % = exposition minimale, 100 % = exposition maximale.
 *
 * Module volontairement sans dépendance à React : il est réutilisable côté
 * serveur et testable isolément.
 */

export type RiskCategory = "procedures" | "humain" | "technique";

/** Ordre d'affichage, partagé par le questionnaire et les barres de score. */
export const RISK_CATEGORY_ORDER: readonly RiskCategory[] = [
  "procedures",
  "humain",
  "technique",
];

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  procedures: "Procédures",
  humain: "Humain",
  technique: "Technique",
};

/** Sous-titre affiché au-dessus de chaque groupe de questions. */
export const RISK_CATEGORY_HINTS: Record<RiskCategory, string> = {
  procedures: "Vos règles internes autour des virements",
  humain: "Le niveau de vigilance de vos équipes",
  technique: "Vos garde-fous outils et accès",
};

export type RiskOption = {
  label: string;
  /** 0 = sûr, 2 = intermédiaire, 3 = à risque */
  poids: 0 | 2 | 3;
};

export type RiskQuestion = {
  id: string;
  categorie: RiskCategory;
  question: string;
  options: RiskOption[];
};

/* --------------------------------------------------------------------------
   Questionnaire
   -------------------------------------------------------------------------- */

export const RISK_QUESTIONS: readonly RiskQuestion[] = [
  // ---------- Procédures ----------
  {
    id: "double_validation",
    categorie: "procedures",
    question:
      "Avez-vous une procédure de double validation pour les virements importants ?",
    options: [
      { label: "Oui, systématiquement", poids: 0 },
      { label: "Parfois, selon le montant", poids: 2 },
      { label: "Non", poids: 3 },
    ],
  },
  {
    id: "verification_rib",
    categorie: "procedures",
    question:
      "Comment vérifiez-vous un changement de coordonnées bancaires fournisseur ?",
    options: [
      { label: "Rappel sur un numéro déjà connu", poids: 0 },
      { label: "Confirmation par email uniquement", poids: 2 },
      { label: "Aucune vérification", poids: 3 },
    ],
  },
  {
    id: "plafond_approbations",
    categorie: "procedures",
    question:
      "Existe-t-il un plafond au-delà duquel un virement exige plusieurs approbations ?",
    options: [
      { label: "Oui", poids: 0 },
      { label: "Non", poids: 3 },
    ],
  },

  // ---------- Humain ----------
  {
    id: "formation_equipe",
    categorie: "humain",
    question:
      "Votre équipe comptabilité / finance a-t-elle été formée à la fraude au président ?",
    options: [
      { label: "Oui, récemment", poids: 0 },
      { label: "Oui, il y a longtemps", poids: 2 },
      { label: "Jamais", poids: 3 },
    ],
  },
  {
    id: "conscience_deepfake",
    categorie: "humain",
    question:
      "Vos employés savent-ils qu'une voix ou une vidéo peut être truquée par IA ?",
    options: [
      { label: "Oui, c'est clair pour eux", poids: 0 },
      { label: "Vaguement", poids: 2 },
      { label: "Non", poids: 3 },
    ],
  },
  {
    id: "antecedents",
    categorie: "humain",
    question: "Avez-vous déjà subi ou frôlé une tentative de fraude au virement ?",
    options: [
      { label: "Non, jamais", poids: 0 },
      { label: "Une tentative a failli aboutir", poids: 2 },
      { label: "Oui, nous en avons été victimes", poids: 3 },
    ],
  },

  // ---------- Technique ----------
  {
    id: "mfa_messagerie",
    categorie: "technique",
    question:
      "La double authentification (MFA) est-elle active sur les messageries ?",
    options: [
      { label: "Oui, partout", poids: 0 },
      { label: "Partiellement", poids: 2 },
      { label: "Non", poids: 3 },
    ],
  },
  {
    id: "signalement_externe",
    categorie: "technique",
    question:
      "Votre messagerie signale-t-elle les emails externes ou les tentatives d'usurpation ?",
    options: [
      { label: "Oui", poids: 0 },
      { label: "Je ne sais pas", poids: 2 },
      { label: "Non", poids: 3 },
    ],
  },
  {
    id: "qui_ordonne",
    categorie: "technique",
    question: "Qui peut ordonner un virement ?",
    options: [
      { label: "Des rôles limités et définis", poids: 0 },
      { label: "Plusieurs personnes", poids: 2 },
      { label: "C'est flou", poids: 3 },
    ],
  },
];

export const RISK_QUESTION_COUNT = RISK_QUESTIONS.length;

/** Questions d'une catégorie, dans l'ordre du questionnaire. */
export function questionsByCategory(categorie: RiskCategory): RiskQuestion[] {
  return RISK_QUESTIONS.filter((q) => q.categorie === categorie);
}

/* --------------------------------------------------------------------------
   Calcul des scores
   -------------------------------------------------------------------------- */

/** Réponses en cours de saisie : id de question → index de l'option choisie. */
export type RiskAnswers = Record<string, number>;

export type RiskScores = {
  procedures: number;
  humain: number;
  technique: number;
  global: number;
};

/** Toutes les questions ont-elles une réponse ? L'étape 2 est obligatoire. */
export function isComplete(answers: RiskAnswers): boolean {
  return RISK_QUESTIONS.every((q) => {
    const index = answers[q.id];
    return Number.isInteger(index) && q.options[index] !== undefined;
  });
}

/**
 * Additionne les poids par catégorie, rapporte au maximum atteignable de la
 * catégorie, puis fait la moyenne des trois pourcentages pour le score global.
 */
export function computeRiskScores(answers: RiskAnswers): RiskScores {
  const obtenu: Record<RiskCategory, number> = {
    procedures: 0,
    humain: 0,
    technique: 0,
  };
  const maximum: Record<RiskCategory, number> = {
    procedures: 0,
    humain: 0,
    technique: 0,
  };

  for (const q of RISK_QUESTIONS) {
    // Le maximum est déduit des options : une question à 2 choix reste sur 3.
    maximum[q.categorie] += Math.max(...q.options.map((o) => o.poids));

    const option = q.options[answers[q.id]];
    if (option) {
      obtenu[q.categorie] += option.poids;
    }
  }

  const pourcentage = (categorie: RiskCategory) =>
    maximum[categorie] === 0
      ? 0
      : Math.round((obtenu[categorie] / maximum[categorie]) * 100);

  const procedures = pourcentage("procedures");
  const humain = pourcentage("humain");
  const technique = pourcentage("technique");

  return {
    procedures,
    humain,
    technique,
    global: Math.round((procedures + humain + technique) / 3),
  };
}

/** Réponse telle qu'enregistrée en base : lisible sans le code du questionnaire. */
export type StoredAnswer = {
  question: string;
  categorie: RiskCategory;
  reponse: string;
  poids: number;
};

/**
 * Prépare le contenu de la colonne `reponses` (jsonb). On stocke le libellé
 * plutôt que l'index : les scores restent interprétables même si le
 * questionnaire évolue.
 */
export function serializeAnswers(
  answers: RiskAnswers,
): Record<string, StoredAnswer> {
  const resultat: Record<string, StoredAnswer> = {};

  for (const q of RISK_QUESTIONS) {
    const option = q.options[answers[q.id]];
    if (!option) continue;

    resultat[q.id] = {
      question: q.question,
      categorie: q.categorie,
      reponse: option.label,
      poids: option.poids,
    };
  }

  return resultat;
}

/* --------------------------------------------------------------------------
   Lecture des scores
   -------------------------------------------------------------------------- */

export type RiskLevel = "faible" | "modere" | "eleve";

/** Seuils de bascule entre les trois niveaux de risque. */
export function riskLevel(pourcentage: number): RiskLevel {
  if (pourcentage < 34) return "faible";
  if (pourcentage < 67) return "modere";
  return "eleve";
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  faible: "Risque faible",
  modere: "Risque modéré",
  eleve: "Risque élevé",
};

/** Catégorie la plus exposée. À égalité, l'ordre d'affichage tranche. */
export function weakestCategory(scores: RiskScores): RiskCategory {
  return RISK_CATEGORY_ORDER.reduce((pire, categorie) =>
    scores[categorie] > scores[pire] ? categorie : pire,
  );
}

/** Accroche affichée à l'étape 3, adaptée à la catégorie la plus à risque. */
const ACCROCHES: Record<RiskCategory, string> = {
  procedures:
    "Vos procédures laissent passer un virement urgent sans contre-appel. Une simulation montre à vos équipes ce que ça donne en conditions réelles.",
  humain:
    "Vos équipes sont le maillon exposé. Lancez une campagne pour les confronter à un faux message avant qu'un vrai n'arrive.",
  technique:
    "Vos garde-fous techniques laissent passer des messages usurpés. Une simulation révèle qui les prend au sérieux.",
};

export function riskHeadline(scores: RiskScores): {
  titre: string;
  message: string;
} {
  const pire = weakestCategory(scores);
  const label = RISK_CATEGORY_LABELS[pire].toLowerCase();

  // Exposition déjà faible partout : on ne dramatise pas.
  if (riskLevel(scores.global) === "faible") {
    return {
      titre: "Votre dispositif tient la route",
      message:
        "Votre exposition est faible sur les trois axes. Une simulation régulière permet de vérifier que ça tient dans le temps.",
    };
  }

  return {
    titre: `Votre point faible : ${label}`,
    message: ACCROCHES[pire],
  };
}
