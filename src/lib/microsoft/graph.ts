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

/**
 * Adresses de Graph et d'Entra ID.
 *
 * Surchargeables par l'environnement, uniquement pour pouvoir faire tourner
 * le worker contre un serveur d'essai. En production ces variables ne sont
 * pas définies et les valeurs réelles s'appliquent.
 */
const BASE_GRAPH =
  process.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0";
const BASE_LOGIN =
  process.env.MS_LOGIN_BASE_URL ?? "https://login.microsoftonline.com";

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
    `${BASE_LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
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

  // Graph renvoie ses liens de pagination — @odata.nextLink, @odata.deltaLink —
  // en URL ABSOLUE. Un deltaLink conservé en base revient donc ici tel quel :
  // lui préfixer la base produirait « https://…/v1.0https://…/v1.0/users/… ».
  // On accepte donc les deux formes.
  const url = /^https?:\/\//i.test(chemin) ? chemin : `${BASE_GRAPH}${chemin}`;

  const reponse = await fetch(url, {
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

/* ==========================================================================
   Annuaire
   ========================================================================== */

export type PersonneAnnuaire = {
  graph_user_id: string;
  nom: string;
  email: string | null;
};

type UtilisateurGraph = {
  id?: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
};

/**
 * Instantané de l'annuaire du locataire.
 *
 * Nécessite User.Read.All en autorisation d'application — la permission déjà
 * ajoutée pour créer les abonnements.
 *
 * On ne demande QUE les quatre champs utiles. Graph renvoie par défaut une
 * vingtaine d'attributs par personne, dont le poste, le téléphone et le
 * bureau : autant de données personnelles qu'on n'a aucune raison de faire
 * transiter.
 *
 * La pagination est suivie jusqu'au bout. Un annuaire tronqué produirait des
 * usurpations non détectées, et surtout des domaines manquants — ce qui, sur
 * Outlook, se paie en bannières posées sur du courrier légitime.
 */
export async function listerAnnuaire(
  tenantId: string,
  plafond = 5000,
): Promise<PersonneAnnuaire[]> {
  const personnes: PersonneAnnuaire[] = [];
  let chemin: string | null =
    "/users?$select=id,displayName,mail,userPrincipalName&$top=999";

  while (chemin && personnes.length < plafond) {
    const page: { value?: UtilisateurGraph[]; "@odata.nextLink"?: string } =
      await appelGraph(tenantId, "GET", chemin);

    for (const u of page.value ?? []) {
      const nom = (u.displayName ?? "").trim();
      if (!u.id || !nom) continue;
      personnes.push({
        graph_user_id: u.id,
        nom,
        email: (u.mail ?? u.userPrincipalName ?? null)?.toLowerCase() ?? null,
      });
    }

    const suivant = page["@odata.nextLink"];
    chemin = suivant ?? null;
  }

  return personnes;
}

/**
 * Domaines déduits des adresses de l'annuaire.
 *
 * Les tirer de `/users` évite une permission supplémentaire : la liste
 * faisant autorité vit sur `/organization` (verifiedDomains), mais elle
 * demanderait un consentement de plus à l'installation. Les adresses réelles
 * des salariés donnent le même résultat pour ce qu'on en fait.
 *
 * Les domaines techniques *.onmicrosoft.com sont écartés : tout locataire en
 * possède un, il n'identifie pas l'entreprise et le comparer à quoi que ce
 * soit n'aurait pas de sens.
 */
export function domainesDeAnnuaire(personnes: PersonneAnnuaire[]): string[] {
  const comptes = new Map<string, number>();

  for (const p of personnes) {
    const domaine = p.email?.split("@")[1]?.trim().toLowerCase();
    if (!domaine || domaine.endsWith(".onmicrosoft.com")) continue;
    comptes.set(domaine, (comptes.get(domaine) ?? 0) + 1);
  }

  return [...comptes.keys()].sort();
}

/* ==========================================================================
   Abonnements
   ========================================================================== */

export type AbonnementGraph = {
  id: string;
  expirationDateTime: string;
  resource?: string;
  clientState?: string;
};

/**
 * Prolonge un abonnement existant.
 *
 * Un abonnement à des messages Outlook vit au plus 10 080 minutes, soit un peu
 * moins de 7 jours. Au-delà, Graph refuse la date demandée.
 *
 * Un 404 ici veut dire que Microsoft a supprimé l'abonnement de son côté :
 * il faut en créer un neuf, pas insister.
 */
export async function renouvelerAbonnement(
  tenantId: string,
  subscriptionId: string,
  expiration: string,
): Promise<AbonnementGraph> {
  return appelGraph<AbonnementGraph>(
    tenantId,
    "PATCH",
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { expirationDateTime: expiration },
  );
}

/**
 * Crée un abonnement aux messages d'une boîte.
 *
 * `lifecycleNotificationUrl` pointe sur le MÊME point d'entrée que les
 * notifications ordinaires — la documentation l'autorise explicitement, et
 * cela évite un second point d'entrée à valider et à surveiller. Le webhook
 * distingue les deux à la présence de `lifecycleEvent`.
 *
 * `changeType: created` uniquement : sur « updated », notre propre pose de
 * bannière déclencherait une notification, qui relancerait une analyse, qui
 * reposerait une bannière — une boucle sans fin.
 */
export async function creerAbonnement(
  tenantId: string,
  graphUserId: string,
  notificationUrl: string,
  expiration: string,
  clientState?: string,
): Promise<AbonnementGraph & { clientState: string }> {
  const secret =
    clientState ??
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((o) => o.toString(16).padStart(2, "0"))
      .join("");

  const cree = await appelGraph<AbonnementGraph>(tenantId, "POST", "/subscriptions", {
    changeType: "created",
    notificationUrl,
    lifecycleNotificationUrl: notificationUrl,
    resource: `/users/${graphUserId}/mailFolders('inbox')/messages`,
    expirationDateTime: expiration,
    clientState: secret,
  });

  return { ...cree, clientState: secret };
}

/* ==========================================================================
   Catégories Outlook
   ========================================================================== */

/**
 * Catégories posées selon le niveau.
 *
 * ⚠ JAMAIS DE CATÉGORIE POUR L'ABSENCE DE RISQUE. Il n'existe pas d'entrée
 *   « rien à signaler » : on n'affiche que le risque. Une pastille verte sur
 *   un message non analysé — parce que le worker n'est pas passé, parce que
 *   l'abonnement a expiré — vaudrait caution, et c'est précisément ce qu'on
 *   ne peut pas donner.
 *
 * Couleurs : preset0 rouge, preset1 orange, preset3 jaune.
 */
export const CATEGORIES: Record<string, { nom: string; couleur: string }> = {
  eleve: { nom: "Safentreprise — Risque élevé", couleur: "preset0" },
  modere: { nom: "Safentreprise — Suspect", couleur: "preset1" },
  faible: { nom: "Safentreprise — À vérifier", couleur: "preset3" },
};

/** Toutes les catégories du produit, pour le nettoyage à la restauration. */
export const NOMS_CATEGORIES = Object.values(CATEGORIES).map((c) => c.nom);

type CategorieGraph = { id?: string; displayName?: string; color?: string };

export type ResultatCategorie = {
  nom: string;
  /** Déclarée dans la liste maîtresse, donc affichée avec sa couleur. */
  enregistree: boolean;
  motif?: string;
};

/**
 * Déclare la catégorie dans la liste maîtresse de la boîte — AU MIEUX.
 *
 * ⚠ CETTE ÉTAPE EST FACULTATIVE, et le code en dépend.
 *
 *   /outlook/masterCategories exige MailboxSettings.ReadWrite, sans
 *   alternative moins privilégiée. Poser la catégorie SUR LE MESSAGE, en
 *   revanche, ne demande que Mail.ReadWrite — `categories` est une propriété
 *   modifiable d'un message reçu.
 *
 *   Sans cette permission, la catégorie s'affiche donc quand même, mais sans
 *   couleur : Outlook montre son nom, et l'ajoute de lui-même à la liste de
 *   l'utilisateur s'il la reprend. C'est une dégradation d'apparence, pas de
 *   fonction — bien préférable à réclamer un accès en écriture aux réglages
 *   de la boîte de tous les clients.
 *
 * Ne lève donc JAMAIS sur un refus de permission : elle rend compte et laisse
 * l'appelant continuer.
 */
export async function assurerCategorie(
  tenantId: string,
  graphUserId: string,
  niveau: string,
): Promise<ResultatCategorie> {
  const voulue = CATEGORIES[niveau] ?? CATEGORIES.faible;
  const boite = encodeURIComponent(graphUserId);

  const refus = (erreur: unknown): ResultatCategorie | null => {
    if (!(erreur instanceof ErreurGraph)) return null;
    const interdit =
      erreur.statut === 403 ||
      erreur.code === "ErrorAccessDenied" ||
      /access is denied|accessdenied/i.test(erreur.message);
    if (!interdit) return null;
    return {
      nom: voulue.nom,
      enregistree: false,
      motif:
        "MailboxSettings.ReadWrite absent : la catégorie est posée sur le " +
        "message mais n'a pas de couleur déclarée.",
    };
  };

  let existantes: { value?: CategorieGraph[] };
  try {
    existantes = await appelGraph<{ value?: CategorieGraph[] }>(
      tenantId,
      "GET",
      `/users/${boite}/outlook/masterCategories`,
    );
  } catch (erreur) {
    const degrade = refus(erreur);
    if (degrade) return degrade;
    throw erreur;
  }

  if (existantes.value?.some((c) => c.displayName === voulue.nom)) {
    return { nom: voulue.nom, enregistree: true };
  }

  try {
    await appelGraph(tenantId, "POST", `/users/${boite}/outlook/masterCategories`, {
      displayName: voulue.nom,
      color: voulue.couleur,
    });
  } catch (erreur) {
    const degrade = refus(erreur);
    if (degrade) return degrade;

    // Créée entre-temps par un traitement concurrent : c'est le résultat voulu.
    const conflit =
      erreur instanceof ErreurGraph &&
      (erreur.statut === 409 ||
        /already exists|duplicate/i.test(erreur.message));
    if (!conflit) throw erreur;
  }

  return { nom: voulue.nom, enregistree: true };
}

/**
 * Remplace les catégories d'un message.
 *
 * On conserve celles que l'utilisateur a posées lui-même et on ne touche
 * qu'aux nôtres : écraser le classement de quelqu'un serait une perte de
 * données, silencieuse et sans rapport avec ce qu'on lui promet.
 */
export async function poserCategorie(
  tenantId: string,
  graphUserId: string,
  messageId: string,
  categoriesActuelles: string[],
  ajouter: string | null,
): Promise<string[]> {
  const conservees = (categoriesActuelles ?? []).filter(
    (c) => !NOMS_CATEGORIES.includes(c),
  );
  const finales = ajouter ? [...conservees, ajouter] : conservees;

  await appelGraph(
    tenantId,
    "PATCH",
    `/users/${encodeURIComponent(graphUserId)}/messages/${encodeURIComponent(messageId)}`,
    { categories: finales },
  );

  return finales;
}

/** Remplace le corps d'un message. */
export async function remplacerCorps(
  tenantId: string,
  graphUserId: string,
  messageId: string,
  contenu: string,
  typeContenu: "html" | "text" = "html",
): Promise<void> {
  await appelGraph(
    tenantId,
    "PATCH",
    `/users/${encodeURIComponent(graphUserId)}/messages/${encodeURIComponent(messageId)}`,
    { body: { contentType: typeContenu, content: contenu } },
  );
}

/** Ce que le worker lit d'un message. Aucun autre champ n'est demandé. */
export type MessageGraph = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  isDraft?: boolean;
  categories?: string[];
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { contentType?: string; content?: string };
};

const CHAMPS =
  "id,subject,receivedDateTime,isDraft,categories,from,toRecipients,body";

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
