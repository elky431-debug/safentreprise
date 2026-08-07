/**
 * Score de risque dynamique — axe humain piloté par les campagnes.
 *
 * Procédures / technique restent ceux du questionnaire (risk_assessments).
 * Humain = moyenne des scores employés (jamais testé → 100), avec décroissance
 * temporelle si aucune campagne envoyée depuis un moment.
 *
 * Module sans React : utilisable en Server Component / Route Handler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RiskScores } from "@/lib/risk";

/** Bornes du score humain par employé. */
export const PLANCHER_HUMAIN = 10;
export const PLAFOND_HUMAIN = 100;

/** Ajustements cumulés par participation à une campagne (message envoyé). */
export const DELTA_SIGNALE = -25;
export const DELTA_PAS_CLIQUE = -10;
export const DELTA_CLIC_QUIZ_BON = -5;
export const DELTA_CLIC_QUIZ_MAUVAIS = 15;
export const SEUIL_QUIZ_BON = 60;

/** +1 point de risque humain par semaine sans nouvelle campagne envoyée. */
export const POINTS_PAR_SEMAINE_INACTIVITE = 1;

export type CiblePourScore = {
  employee_id: string;
  message_envoye: boolean;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
};

export type ScoreHumainEmploye = {
  employee_id: string;
  score: number;
  /** true si aucune cible avec message_envoye */
  jamaisTeste: boolean;
};

export type ScoreDynamique = RiskScores & {
  /** Scores humains individuels (debug / détail). */
  parEmploye: ScoreHumainEmploye[];
  /** Semaines d'inactivité comptées pour la décroissance. */
  semainesInactivite: number;
  /** Date de la dernière campagne envoyée, si connue. */
  derniereCampagneAt: string | null;
  /** true si on a pu s'appuyer sur un risk_assessments. */
  aQuestionnaire: boolean;
};

/** Borne un entier entre plancher et plafond. */
export function bornerScore(valeur: number): number {
  return Math.min(
    PLAFOND_HUMAIN,
    Math.max(PLANCHER_HUMAIN, Math.round(valeur)),
  );
}

/**
 * Delta d'une seule participation (cible avec message envoyé).
 * Priorité : signalé > neutre (pas cliqué) > clic+quiz bon > clic+échec.
 */
export function deltaCible(c: CiblePourScore): number {
  if (!c.message_envoye) return 0;
  if (c.a_signale) return DELTA_SIGNALE;
  if (!c.a_clique) return DELTA_PAS_CLIQUE;
  if (c.quiz_complete && (c.score_quiz ?? 0) >= SEUIL_QUIZ_BON) {
    return DELTA_CLIC_QUIZ_BON;
  }
  return DELTA_CLIC_QUIZ_MAUVAIS;
}

/** Semaines complètes écoulées depuis une date (0 si absente / future). */
export function semainesDepuis(iso: string | null, maintenant = new Date()): number {
  if (!iso) return 0;
  const debut = new Date(iso).getTime();
  if (Number.isNaN(debut)) return 0;
  const ms = maintenant.getTime() - debut;
  if (ms <= 0) return 0;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Score humain d'un employé : 100 si jamais testé, sinon 100 + Σ deltas,
 * puis + semaines d'inactivité, borné [10, 100].
 */
export function scoreHumainEmploye(
  employeeId: string,
  cibles: CiblePourScore[],
  semainesInactivite: number,
): ScoreHumainEmploye {
  const participations = cibles.filter(
    (c) => c.employee_id === employeeId && c.message_envoye,
  );

  if (participations.length === 0) {
    return {
      employee_id: employeeId,
      jamaisTeste: true,
      score: bornerScore(PLAFOND_HUMAIN + semainesInactivite * POINTS_PAR_SEMAINE_INACTIVITE),
    };
  }

  const brut =
    PLAFOND_HUMAIN +
    participations.reduce((acc, c) => acc + deltaCible(c), 0) +
    semainesInactivite * POINTS_PAR_SEMAINE_INACTIVITE;

  return {
    employee_id: employeeId,
    jamaisTeste: false,
    score: bornerScore(brut),
  };
}

/**
 * Calcule le score dynamique à partir de données déjà chargées.
 * Sans employés : humain = score questionnaire (ou 100).
 */
export function calculerScoreDynamique(input: {
  procedures: number;
  technique: number;
  humainQuestionnaire: number;
  aQuestionnaire: boolean;
  employeeIds: string[];
  cibles: CiblePourScore[];
  derniereCampagneAt: string | null;
  maintenant?: Date;
}): ScoreDynamique {
  const semainesInactivite = semainesDepuis(
    input.derniereCampagneAt,
    input.maintenant,
  );

  if (input.employeeIds.length === 0) {
    const humain = input.aQuestionnaire
      ? bornerScore(input.humainQuestionnaire)
      : PLAFOND_HUMAIN;
    const procedures = input.aQuestionnaire ? input.procedures : 0;
    const technique = input.aQuestionnaire ? input.technique : 0;
    return {
      procedures,
      technique,
      humain,
      global: Math.round((procedures + humain + technique) / 3),
      parEmploye: [],
      semainesInactivite,
      derniereCampagneAt: input.derniereCampagneAt,
      aQuestionnaire: input.aQuestionnaire,
    };
  }

  const parEmploye = input.employeeIds.map((id) =>
    scoreHumainEmploye(id, input.cibles, semainesInactivite),
  );
  const humain = Math.round(
    parEmploye.reduce((s, e) => s + e.score, 0) / parEmploye.length,
  );
  const procedures = input.aQuestionnaire ? input.procedures : 0;
  const technique = input.aQuestionnaire ? input.technique : 0;

  return {
    procedures,
    technique,
    humain,
    global: Math.round((procedures + humain + technique) / 3),
    parEmploye,
    semainesInactivite,
    derniereCampagneAt: input.derniereCampagneAt,
    aQuestionnaire: input.aQuestionnaire,
  };
}

/**
 * Charge les données société (RLS) et recalcule le score dynamique.
 * À appeler à chaque affichage / après une action métier.
 */
export async function chargerScoreDynamique(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ScoreDynamique> {
  const [
    { data: assessment },
    { data: employees },
    { data: cibles },
    { data: derniereCampagne },
  ] = await Promise.all([
    supabase
      .from("risk_assessments")
      .select("score_procedures, score_humain, score_technique")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("employees").select("id").eq("company_id", companyId),
    supabase
      .from("campaign_targets")
      .select(
        "employee_id, message_envoye, a_clique, a_signale, quiz_complete, score_quiz",
      ),
    supabase
      .from("campaigns")
      .select("date_lancement")
      .eq("company_id", companyId)
      .eq("statut", "envoyee")
      .order("date_lancement", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // RLS filtre déjà les cibles de la société connectée
  const ciblesNettes: CiblePourScore[] = (cibles ?? []).map((c) => ({
    employee_id: c.employee_id as string,
    message_envoye: Boolean(c.message_envoye),
    a_clique: Boolean(c.a_clique),
    a_signale: Boolean(c.a_signale),
    quiz_complete: Boolean(c.quiz_complete),
    score_quiz: (c.score_quiz as number | null) ?? null,
  }));

  return calculerScoreDynamique({
    procedures: assessment?.score_procedures ?? 0,
    technique: assessment?.score_technique ?? 0,
    humainQuestionnaire: assessment?.score_humain ?? PLAFOND_HUMAIN,
    aQuestionnaire: Boolean(assessment),
    employeeIds: (employees ?? []).map((e) => e.id as string),
    cibles: ciblesNettes,
    derniereCampagneAt: derniereCampagne?.date_lancement ?? null,
  });
}

/**
 * Enregistre un point d'historique (score_history).
 * RLS : company_id = get_my_company_id() pour les sessions authentifiées.
 */
export async function persisterScoreHistory(
  supabase: SupabaseClient,
  companyId: string,
  score?: ScoreDynamique,
): Promise<{ ok: boolean; erreur?: string }> {
  const dynamiques = score ?? (await chargerScoreDynamique(supabase, companyId));

  const { error } = await supabase.from("score_history").insert({
    company_id: companyId,
    score_global: dynamiques.global,
    score_humain: dynamiques.humain,
  });

  if (error) {
    console.error("score_history insert :", error);
    return { ok: false, erreur: error.message };
  }
  return { ok: true };
}
