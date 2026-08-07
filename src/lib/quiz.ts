/**
 * Helpers quiz — chargement depuis la base + pédagogie.
 */
import type { TypeFraude } from "@/lib/types";

export type QuestionQuiz = {
  id: string;
  question: string;
  choices: string[];
  /** Index 0-based de la bonne réponse */
  correctIndex: number;
};

export type QuizRpcRow = {
  id: string;
  question: string;
  options: string[] | unknown;
  bonne_reponse: number;
  ordre: number;
};

/** Convertit une ligne RPC / table en QuestionQuiz affichable. */
export function mapQuizRow(row: QuizRpcRow): QuestionQuiz {
  const choices = Array.isArray(row.options)
    ? (row.options as string[])
    : typeof row.options === "string"
      ? (JSON.parse(row.options) as string[])
      : [];
  return {
    id: row.id,
    question: row.question,
    choices,
    correctIndex: row.bonne_reponse,
  };
}

export function signauxAlerte(type: TypeFraude): string[] {
  if (type === "fournisseur") {
    return [
      "Changement de RIB annoncé hors des canaux habituels",
      "Urgence artificielle (« dès aujourd'hui », « éviter un rejet »)",
      "Demande d'accusé de réception avant transmission des nouvelles coordonnées",
      "Expéditeur qui imite le service comptabilité d'un partenaire",
    ];
  }
  return [
    "Urgence et confidentialité (« ne pas en parler en interne »)",
    "Demande de virement hors procédure / hors double validation",
    "Usurpation du nom du dirigeant (domaine ou ton inhabituel)",
    "Pression émotionnelle (déplacement, dossier sensible, délai court)",
  ];
}

export function titreScenario(type: TypeFraude): string {
  return type === "fournisseur"
    ? "Simulation — faux fournisseur"
    : "Simulation — arnaque au président";
}

export function scoreSurCent(bonnes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((bonnes / total) * 100);
}
