/**
 * Ancienne réception des tentatives détectées par l'extension Safentreprise
 * Guard. FERMÉE.
 *
 * POST /api/extension/menace  →  410 Gone
 *
 * ⚠ ELLE N'ÉCRIT PLUS RIEN EN BASE. La détection passe désormais par le
 *   raccordement Microsoft 365 : le serveur analyse les messages et pose
 *   l'avertissement lui-même, sans extension. Cette route ne lit même plus le
 *   corps de la requête — donc plus aucun code d'activation, plus aucune
 *   métadonnée de message ne transite par elle.
 *
 * ⚠ LE PRÉFLIGHT CORS EST CONSERVÉ, ET IL LE FAUT. Une extension encore
 *   installée envoie un OPTIONS avant son POST. Sans réponse au préflight, le
 *   navigateur bloque l'appel et l'extension voit une erreur réseau au lieu du
 *   410 : elle ne peut alors pas distinguer une panne d'un arrêt de service, et
 *   réessaie indéfiniment.
 *
 * ⚠ CE QUI RESTE EN PLACE, VOLONTAIREMENT : la fonction `enregistrer_menace()`
 *   et la table `menaces_detectees`. On ferme la porte d'abord, on nettoie
 *   ensuite. Plus rien ne les appelle depuis l'application.
 */
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";

export async function OPTIONS() {
  return reponsePreflight();
}

export async function POST() {
  return reponseCors(
    {
      erreur:
        "L'extension Safentreprise n'est plus prise en charge. La détection passe désormais par le raccordement Microsoft 365, sans rien à installer.",
    },
    410,
  );
}
