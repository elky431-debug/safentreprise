/**
 * Effet du déploiement de l'extension sur l'axe TECHNIQUE du score de risque.
 *
 * Principe : l'extension est une mesure technique. Plus elle couvre de postes,
 * plus la surface d'attaque se réduit — l'axe technique baisse donc à mesure
 * que la couverture progresse, et avec lui le score global.
 *
 * Les axes Procédures et Humain ne sont pas touchés : ils relèvent du
 * questionnaire et des campagnes.
 *
 * Module sans React : utilisable en Server Component comme en Route Handler.
 */

/** Réduction maximale de l'axe technique, atteinte à 100 % de couverture. */
export const REDUCTION_TECHNIQUE_MAX = 50;

/**
 * Plancher de l'axe technique une fois la réduction appliquée.
 * L'extension réduit fortement le risque, elle ne l'annule jamais : il reste
 * toujours une exposition résiduelle.
 */
export const PLANCHER_TECHNIQUE = 5;

/** Plafond commun à tous les axes. */
export const PLAFOND = 100;

/**
 * Taux de couverture : part des collaborateurs ayant activé l'extension.
 * Renvoie un ratio entre 0 et 1, borné même si les activations dépassent
 * l'effectif (activation depuis une adresse absente de la liste employés).
 */
export function couvertureExtension(
  activations: number,
  employes: number,
): number {
  if (employes <= 0 || activations <= 0) return 0;
  return Math.min(1, activations / employes);
}

/**
 * Axe technique corrigé par la couverture de l'extension.
 * Interpolation linéaire : 0 % de couverture laisse la valeur de base
 * inchangée, 100 % lui retire REDUCTION_TECHNIQUE_MAX points.
 *
 * Un axe de base à 0 (aucun questionnaire rempli) reste à 0 : il n'y a rien
 * à réduire, et l'on n'invente pas un risque qui n'a pas été évalué.
 */
export function techniqueAjuste(base: number, couverture: number): number {
  if (base <= 0) return 0;

  const ratio = Math.min(1, Math.max(0, couverture));
  const reduit = base - REDUCTION_TECHNIQUE_MAX * ratio;

  return Math.round(Math.min(PLAFOND, Math.max(PLANCHER_TECHNIQUE, reduit)));
}

/** Score global : moyenne des trois axes, bornée [0, 100]. */
export function scoreGlobal(
  procedures: number,
  humain: number,
  technique: number,
): number {
  const moyenne = (procedures + humain + technique) / 3;
  return Math.round(Math.min(PLAFOND, Math.max(0, moyenne)));
}

export type ScoreAvecExtension = {
  procedures: number;
  humain: number;
  /** Axe technique après réduction par la couverture */
  technique: number;
  /** Axe technique tel qu'issu du questionnaire, avant réduction */
  techniqueBase: number;
  /** Points retirés à l'axe technique */
  reductionTechnique: number;
  global: number;
  /** Score global qu'on aurait sans extension déployée */
  globalSansExtension: number;
  /** Ratio 0–1 */
  couverture: number;
};

/**
 * Applique la couverture de l'extension à un score déjà calculé.
 * `procedures`, `humain` et `techniqueBase` proviennent de
 * `chargerScoreDynamique`.
 */
export function appliquerExtensionAuScore(input: {
  procedures: number;
  humain: number;
  techniqueBase: number;
  activations: number;
  employes: number;
}): ScoreAvecExtension {
  const couverture = couvertureExtension(input.activations, input.employes);
  const technique = techniqueAjuste(input.techniqueBase, couverture);

  return {
    procedures: input.procedures,
    humain: input.humain,
    technique,
    techniqueBase: input.techniqueBase,
    reductionTechnique: Math.max(0, input.techniqueBase - technique),
    global: scoreGlobal(input.procedures, input.humain, technique),
    globalSansExtension: scoreGlobal(
      input.procedures,
      input.humain,
      input.techniqueBase,
    ),
    couverture,
  };
}
