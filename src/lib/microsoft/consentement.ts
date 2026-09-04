/**
 * Le raccordement d'un client Microsoft 365, côté vérification.
 *
 * Ce fichier ne contient que ce que les DEUX routes de consentement partagent :
 * la construction de l'URL de consentement, la lecture de l'adresse d'appel, et
 * l'appel des fonctions réservées à la clé de service.
 */

/** Le chemin qui reçoit le retour de Microsoft. Doit correspondre à Azure. */
export const CHEMIN_RETOUR = "/api/microsoft/consentement";

const BASE_LOGIN = process.env.MS_LOGIN_BASE_URL ?? "https://login.microsoftonline.com";

export type Configuration = {
  clientId: string;
  redirectUri: string;
};

/**
 * Lit et VALIDE la configuration nécessaire au parcours.
 *
 * ⚠ Aucune déduction ici, contrairement à l'adresse du webhook. Une URI de
 *   redirection doit correspondre AU CARACTÈRE PRÈS à celle déclarée dans
 *   Azure : une valeur devinée serait rejetée par Microsoft avec un message
 *   obscur, au milieu du parcours d'un client. Mieux vaut refuser de partir.
 */
export function configurationConsentement():
  | { ok: true; config: Configuration }
  | { ok: false; erreur: string } {
  const clientId = process.env.MS_CLIENT_ID?.trim();
  if (!clientId) {
    return { ok: false, erreur: "MS_CLIENT_ID absent de l'environnement." };
  }

  const redirectUri = process.env.MS_REDIRECT_URI?.trim();
  if (!redirectUri) {
    return {
      ok: false,
      erreur:
        "MS_REDIRECT_URI absent. Poser sur Netlify la valeur exacte déclarée " +
        `dans Azure, par exemple https://exemple.fr${CHEMIN_RETOUR}`,
    };
  }

  let analysee: URL;
  try {
    analysee = new URL(redirectUri);
  } catch {
    return { ok: false, erreur: `MS_REDIRECT_URI n'est pas une URL : ${redirectUri}` };
  }

  if (analysee.protocol !== "https:") {
    return { ok: false, erreur: "MS_REDIRECT_URI doit être en HTTPS." };
  }

  // Une barre oblique finale, une majuscule, un autre chemin : Microsoft
  // rejette. Autant le dire ici, où le message est lisible.
  if (analysee.pathname !== CHEMIN_RETOUR) {
    return {
      ok: false,
      erreur:
        `MS_REDIRECT_URI doit se terminer par ${CHEMIN_RETOUR}, sans barre ` +
        `oblique finale. Valeur lue : ${analysee.pathname}`,
    };
  }

  return { ok: true, config: { clientId, redirectUri } };
}

/**
 * L'adresse à laquelle Microsoft demande l'accord de l'administrateur.
 *
 * « organizations » plutôt qu'un identifiant de locataire : on ne sait pas
 * encore chez qui l'administrateur va se connecter, c'est justement ce que
 * cette étape établit.
 *
 * « .default » demande les permissions déjà déclarées sur l'application, qui
 * sont celles que l'administrateur verra à l'écran.
 */
export function urlConsentement(config: Configuration, etat: string): string {
  const parametres = new URLSearchParams({
    client_id: config.clientId,
    scope: "https://graph.microsoft.com/.default",
    redirect_uri: config.redirectUri,
    state: etat,
  });
  return `${BASE_LOGIN}/organizations/v2.0/adminconsent?${parametres}`;
}

/**
 * L'adresse d'où vient la demande, pour la preuve du consentement.
 *
 * Netlify pose x-nf-client-connection-ip ; les mandataires posent
 * x-forwarded-for, dont seule la première valeur est celle du client.
 */
export function adresseAppelante(requete: Request): string | null {
  const nf = requete.headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const transmise = requete.headers.get("x-forwarded-for");
  if (transmise) return transmise.split(",")[0]?.trim() || null;
  return null;
}

/**
 * Appel d'une fonction Postgres avec la clé de service.
 *
 * valider_consentement_graph et echec_consentement_graph sont réservées à
 * service_role : elles écrivent la preuve du consentement, et un client ne
 * doit pas pouvoir l'écrire lui-même.
 */
export async function rpcService<T>(
  nom: string,
  parametres: Record<string, unknown>,
): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.");
  }

  const reponse = await fetch(`${url}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parametres),
  });

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`${nom} : HTTP ${reponse.status} — ${texte.slice(0, 300)}`);
  }
  return (texte.trim() === "" ? null : JSON.parse(texte)) as T;
}
