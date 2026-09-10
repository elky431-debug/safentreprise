/**
 * Effet de la surveillance Microsoft 365 sur l'axe TECHNIQUE du score de risque.
 *
 * Remplace `risk-extension.ts`, dont la couverture reposait sur le déploiement
 * de l'extension Chrome — un produit abandonné. Pour un client raccordé via
 * Graph, cette couverture valait zéro : ses boîtes étaient analysées à chaque
 * message reçu, et son score n'en tenait aucun compte.
 *
 * ⚠ MÊME FORMULE, MÊME POIDS, MÊME PLAFOND QUE `risk-extension.ts`. Seule la
 *   SOURCE de la couverture change : même interpolation linéaire, 50 points
 *   d'allègement au maximum, plancher à 5, plafond à 100.
 *
 * ⚠ LES VALEURS SONT REDÉFINIES ICI PLUTÔT QU'IMPORTÉES DE L'ANCIEN MODULE,
 *   parce que celui-ci est destiné à disparaître : en dépendre ferait tomber
 *   ce calcul-ci le jour de sa suppression. L'identité des deux n'est donc pas
 *   garantie par le typage mais par le test — `risk-surveillance.test.ts`
 *   compare les deux modules sur cinq taux de couverture et échoue au moindre
 *   écart. Ce test est le seul à supprimer avec `risk-extension.ts`.
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
 * La surveillance réduit fortement le risque, elle ne l'annule jamais : il
 * reste toujours une exposition résiduelle.
 */
export const PLANCHER_TECHNIQUE = 5;

/** Plafond commun à tous les axes. */
export const PLAFOND = 100;

/**
 * Axe technique corrigé par la couverture.
 * Interpolation linéaire : 0 % de couverture laisse la valeur de base
 * inchangée, 100 % lui retire REDUCTION_TECHNIQUE_MAX points.
 *
 * Un axe de base à 0 (aucun questionnaire rempli) reste à 0 : il n'y a rien à
 * réduire, et l'on n'invente pas un risque qui n'a pas été évalué.
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

/**
 * Taux de couverture : part des collaborateurs dont la boîte est réellement
 * surveillée. Ratio entre 0 et 1.
 *
 * ⚠ ON COMPTE LES BOÎTES RÉELLEMENT SURVEILLÉES, PAS CELLES QUI SONT COCHÉES.
 *   Le décompte doit venir de `estSurveillee` (choisie ET autorisée ET abonnée
 *   chez Microsoft) — voir `@/lib/microsoft/etat`. Une boîte cochée dont la
 *   surveillance n'a jamais démarré n'analyse rien : la compter reviendrait à
 *   alléger le score d'un client qui n'est pas protégé, exactement le contraire
 *   de ce que doit faire un score de risque.
 *
 * ⚠ BORNÉ À 1. Une société peut surveiller des boîtes fonctionnelles
 *   (compta@, factures@) qui ne correspondent à aucun collaborateur de sa
 *   liste : le ratio dépasserait alors 1 sans que la protection soit meilleure
 *   que totale.
 */
export function couvertureSurveillance(
  boitesSurveillees: number,
  employes: number,
): number {
  if (employes <= 0 || boitesSurveillees <= 0) return 0;
  return Math.min(1, boitesSurveillees / employes);
}

export type ScoreAvecSurveillance = {
  procedures: number;
  humain: number;
  /** Axe technique après réduction par la couverture */
  technique: number;
  /** Axe technique tel qu'issu du questionnaire, avant réduction */
  techniqueBase: number;
  /** Points retirés à l'axe technique */
  reductionTechnique: number;
  global: number;
  /** Score global qu'on aurait sans aucune boîte surveillée */
  globalSansSurveillance: number;
  /** Ratio 0–1 */
  couverture: number;
  /** Décompte brut, pour l'affichage : « 8 boîtes sur 12 collaborateurs » */
  boitesSurveillees: number;
  employes: number;
};

/**
 * Applique la couverture de surveillance à un score déjà calculé.
 * `procedures`, `humain` et `techniqueBase` proviennent de
 * `chargerScoreDynamique`.
 */
export function appliquerSurveillanceAuScore(input: {
  procedures: number;
  humain: number;
  techniqueBase: number;
  boitesSurveillees: number;
  employes: number;
}): ScoreAvecSurveillance {
  const couverture = couvertureSurveillance(
    input.boitesSurveillees,
    input.employes,
  );
  const technique = techniqueAjuste(input.techniqueBase, couverture);

  return {
    procedures: input.procedures,
    humain: input.humain,
    technique,
    techniqueBase: input.techniqueBase,
    reductionTechnique: Math.max(0, input.techniqueBase - technique),
    global: scoreGlobal(input.procedures, input.humain, technique),
    globalSansSurveillance: scoreGlobal(
      input.procedures,
      input.humain,
      input.techniqueBase,
    ),
    couverture,
    boitesSurveillees: input.boitesSurveillees,
    employes: input.employes,
  };
}
