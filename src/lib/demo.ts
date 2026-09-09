/**
 * Listes de choix du formulaire de démonstration.
 *
 * ⚠ ELLES VIVENT ICI ET NON DANS LA ROUTE. Un fichier `route.ts` n'autorise
 *   que les gestionnaires HTTP en export : y déclarer une constante partagée
 *   fait échouer la compilation. Le formulaire et la route lisent donc la même
 *   source depuis ce module — c'est ce qui garantit que la validation serveur
 *   accepte exactement ce que le navigateur propose.
 */
export const EFFECTIFS = [
  "1-10",
  "11-25",
  "26-50",
  "51-100",
  "101-200",
  "plus de 200",
] as const;

export const REPONSES_MICROSOFT = ["Oui", "Non", "Je ne sais pas"] as const;

export type Effectif = (typeof EFFECTIFS)[number];
export type ReponseMicrosoft = (typeof REPONSES_MICROSOFT)[number];
