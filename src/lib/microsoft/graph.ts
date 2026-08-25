/**
 * Accès à Microsoft Graph, côté serveur.
 *
 * Authentification par « client credentials » : l'application agit seule, sans
 * utilisateur connecté, avec les permissions consenties par l'administrateur
 * du locataire. Il n'y a donc AUCUN jeton de rafraîchissement à conserver —
 * on redemande un jeton quand il en faut un.
 *
 * Le jeton est gardé en mémoire le temps de vie de l'instance. Sur une
 * fonction serverless, cette instance est courte et le cache sert surtout
 * quand plusieurs messages sont traités dans la même invocation.
 */

/** Un jeton par locataire, avec sa date de péremption. */
const cache = new Map<string, { jeton: string; expireA: number }>();

/** Marge avant expiration : on ne veut pas être refusé en plein traitement. */
const MARGE_MS = 60_000;

export class ErreurGraph extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly code: string | null,
    /** Une reprise plus tard a-t-elle une chance d'aboutir ? */
    readonly reessayable: boolean,
  ) {
    super(message);
    this.name = "ErreurGraph";
  }
}

function configuration() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MS_CLIENT_ID ou MS_CLIENT_SECRET absent de l'environnement.",
    );
  }
  return { clientId, clientSecret };
}

/** Jeton d'application pour un locataire donné. */
export async function obtenirJeton(tenantId: string): Promise<string> {
  const enCache = cache.get(tenantId);
  if (enCache && enCache.expireA > Date.now() + MARGE_MS) {
    return enCache.jeton;
  }

  const { clientId, clientSecret } = configuration();

  const reponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  const donnees = (await reponse.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!reponse.ok || !donnees.access_token) {
    throw new ErreurGraph(
      `Authentification refusée : ${donnees.error ?? "?"} — ${donnees.error_description ?? ""}`,
      reponse.status,
      donnees.error ?? null,
      // Un secret expiré ou un consentement retiré ne s'arrangera pas tout seul.
      reponse.status >= 500,
    );
  }

  cache.set(tenantId, {
    jeton: donnees.access_token,
    expireA: Date.now() + (donnees.expires_in ?? 3600) * 1000,
  });

  return donnees.access_token;
}

/** Erreurs pour lesquelles réessayer plus tard a du sens. */
function estReessayable(statut: number, code: string | null): boolean {
  if (statut === 429) return true; // trop de requêtes
  if (statut >= 500) return true; // Graph indisponible
  if (code === "MailboxNotEnabledForRESTAPI") return false;
  if (statut === 404) return false; // message supprimé ou déplacé
  if (statut === 403) return false; // permission manquante
  if (statut === 401) return false; // jeton refusé
  return false;
}

/** Appel Graph authentifié pour un locataire. */
export async function appelGraph<T>(
  tenantId: string,
  methode: string,
  chemin: string,
  corps?: unknown,
): Promise<T> {
  const jeton = await obtenirJeton(tenantId);

  const reponse = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${jeton}`,
      ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });

  if (reponse.status === 204) return null as T;

  const texte = await reponse.text();
  let donnees: unknown = null;
  try {
    donnees = texte ? JSON.parse(texte) : null;
  } catch {
    donnees = null;
  }

  if (!reponse.ok) {
    const erreur = (donnees as { error?: { code?: string; message?: string } })
      ?.error;
    const code = erreur?.code ?? null;
    // Graph renvoie normalement un error.message ; à défaut on garde le début
    // du corps brut, et en dernier recours le simple code HTTP.
    const detail =
      erreur?.message ?? (texte.slice(0, 300) || `HTTP ${reponse.status}`);
    throw new ErreurGraph(
      detail,
      reponse.status,
      code,
      estReessayable(reponse.status, code),
    );
  }

  return donnees as T;
}

/** Ce que le worker lit d'un message. Aucun autre champ n'est demandé. */
export type MessageGraph = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  isDraft?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { contentType?: string; content?: string };
};

const CHAMPS = "id,subject,receivedDateTime,isDraft,from,toRecipients,body";

/**
 * Récupère un message.
 *
 * La boîte est désignée par son identifiant Graph, tiré de NOTRE table
 * boites_surveillees — jamais du chemin annoncé par la notification.
 */
export async function lireMessage(
  tenantId: string,
  graphUserId: string,
  messageId: string,
): Promise<MessageGraph> {
  const boite = encodeURIComponent(graphUserId);
  const message = encodeURIComponent(messageId);

  return appelGraph<MessageGraph>(
    tenantId,
    "GET",
    `/users/${boite}/messages/${message}?$select=${CHAMPS}`,
  );
}
