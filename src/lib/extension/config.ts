/**
 * Points d'entrée de l'API destinés à l'extension Safentreprise Guard.
 *
 * ⚠ L'ÉCRAN QUI LES AFFICHAIT N'EXISTE PLUS. /settings/extension a été
 *   supprimé : le produit ne propose plus d'installer d'extension. Les deux
 *   routes restent en service — une extension déjà installée chez un client
 *   continue de remonter ses alertes — mais plus rien dans l'interface n'y
 *   renvoie, et `urlProduction` n'a plus d'appelant.
 */

/** Domaine de production. En local, l'extension vise http://localhost:3000. */
export const URL_API_PRODUCTION = "https://safentreprise.com";

export const ROUTES_EXTENSION = {
  /** Confirme un code d'activation saisi par l'employé. */
  verifierCode: "/api/extension/verifier-code",
  /** Remonte une tentative détectée (métadonnées uniquement). */
  menace: "/api/extension/menace",
} as const;

/** URL absolue de production d'une route de l'extension. */
export function urlProduction(route: keyof typeof ROUTES_EXTENSION): string {
  return `${URL_API_PRODUCTION}${ROUTES_EXTENSION[route]}`;
}

/** Niveaux de risque acceptés par l'API. */
export const NIVEAUX_RISQUE = ["faible", "modere", "eleve"] as const;
