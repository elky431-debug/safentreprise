/**
 * Ancienne vérification d'un code d'activation saisi dans l'extension
 * Safentreprise Guard. FERMÉE.
 *
 * POST /api/extension/verifier-code  →  410 Gone
 *
 * ⚠ ELLE N'ÉCRIT PLUS RIEN EN BASE. Elle enregistrait auparavant chaque poste
 *   dans `activations_extension`, ce qui alimentait le compteur de
 *   collaborateurs équipés. Ce compteur a été retiré du tableau de bord, et
 *   plus aucun poste n'est enregistré.
 *
 * ⚠ ELLE NE LIT PLUS LE CODE D'ACTIVATION. C'était le seul point d'entrée
 *   public qui permettait de tester un code : le fermer retire du même coup la
 *   possibilité d'en deviner un par essais répétés.
 *
 * ⚠ LE PRÉFLIGHT CORS EST CONSERVÉ, pour la même raison que sur l'autre route :
 *   sans réponse au OPTIONS, l'extension voit une erreur réseau au lieu du 410.
 *
 * ⚠ CE QUI RESTE EN PLACE, VOLONTAIREMENT : `verifier_code_activation()`,
 *   `regenerer_code_activation()` et la table `activations_extension`.
 */
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";

export async function OPTIONS() {
  return reponsePreflight();
}

export async function POST() {
  return reponseCors(
    {
      valide: false,
      erreur:
        "L'extension Safentreprise n'est plus prise en charge. La protection passe désormais par le raccordement Microsoft 365, sans code à saisir.",
    },
    410,
  );
}
