/**
 * En-têtes CORS des routes appelées par l'extension Safentreprise Guard.
 *
 * L'extension émet ses requêtes depuis une origine « chrome-extension://<id> »
 * (ou « moz-extension://… »), inconnue au moment du déploiement : l'origine est
 * donc ouverte. C'est sans danger ici car ces routes n'utilisent NI cookie NI
 * session — l'autorisation repose uniquement sur le code d'activation transmis
 * dans le corps de la requête. Aucune donnée de société n'est accessible sans
 * ce code.
 */
export const EN_TETES_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Réponse JSON accompagnée des en-têtes CORS. */
export function reponseCors(donnees: unknown, status = 200): Response {
  return Response.json(donnees, { status, headers: EN_TETES_CORS });
}

/** Réponse au préflight OPTIONS déclenché par le Content-Type JSON. */
export function reponsePreflight(): Response {
  return new Response(null, { status: 204, headers: EN_TETES_CORS });
}
