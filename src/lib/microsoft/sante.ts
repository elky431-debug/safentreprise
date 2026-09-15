/**
 * La sonde de santé d'un raccordement : elle constate, elle ne décide pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI CE MODULE EXISTE. `maj_sante_tenant` et `tenants_a_verifier`
 *   dormaient depuis 20260907 sans que personne ne les appelle. Rien n'écrivait
 *   donc jamais « revoque » ni « erreur » : un administrateur qui retirait
 *   l'autorisation Microsoft arrêtait toute la chaîne d'analyse, et
 *   l'interface continuait d'annoncer « n boîtes surveillées » jusqu'à
 *   l'expiration naturelle des abonnements — près de SEPT JOURS.
 *
 * ⚠ LE JETON SEUL NE PROUVE RIEN, ET C'EST LE PIÈGE CENTRAL. Si l'administrateur
 *   supprime les AUTORISATIONS sans supprimer l'application, Azure AD continue
 *   de délivrer un jeton — simplement vide de tout rôle. Une sonde qui
 *   s'arrêterait là déclarerait « tout va bien » sur un client devenu aveugle.
 *   D'où le second temps : un appel Graph qui exerce réellement
 *   `Mail.ReadWrite` sur une boîte surveillée.
 *
 * ⚠ ET LE JETON EN CACHE MENT ENCORE PLUS LONGTEMPS. Microsoft ne révoque pas
 *   les jetons déjà délivrés : ils restent valables environ une heure avec les
 *   permissions d'avant. `oublierJeton` est donc appelé AVANT chaque sonde.
 *   Ce n'est pas une précaution théorique — c'est écrit dans `graph.ts` à
 *   partir d'un cas réel où la vérification lisait encore une boîte dont le
 *   consentement venait d'être retiré.
 *
 * ⚠ CE MODULE NE CHOISIT PAS LE STATUT. Il rend un verdict — `ok`, `passager`,
 *   `definitif` — et c'est `constater_sante_tenant`, en SQL, qui décide si cela
 *   vaut une révocation. Un seul endroit à relire pour savoir ce qui fait
 *   basculer un client, au lieu d'une règle éparpillée entre deux langages.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { ErreurGraph, appelGraph, oublierJeton } from "./graph";

/** Ce que la sonde a vu. Rien de plus, rien d'interprété. */
export type Verdict = "ok" | "passager" | "definitif";

export type Constat = {
  verdict: Verdict;
  detail: string;
};

/**
 * Codes d'erreur Azure AD qui désignent l'AUTORISATION elle-même.
 *
 * ⚠ `invalid_client` N'Y EST PAS, ET SON ABSENCE EST VOLONTAIRE. Ce code
 *   signale un secret d'application invalide ou expiré : c'est NOTRE
 *   configuration, pas le consentement du client. Le traiter comme définitif
 *   marquerait tout le parc « révoqué » le jour où le secret expire, et
 *   enverrait chaque client refaire un parcours qui n'y changerait rien.
 *   Voir aussi `panneGenerale()` plus bas.
 */
const CODES_AUTORISATION = new Set([
  "unauthorized_client",
  "invalid_grant",
  "access_denied",
  "consent_required",
  "interaction_required",
  "Authorization_RequestDenied",
  "AccessDenied",
  "InvalidAuthenticationToken",
  "Authorization_IdentityNotFound",
]);

/**
 * Fragments de message Azure AD qui disent la même chose que les codes.
 *
 * ⚠ AADSTS700016 = « application introuvable dans le locataire ». C'est la
 *   forme que prend une révocation lorsque l'administrateur supprime
 *   carrément l'application d'entreprise, plutôt que d'en retirer les
 *   autorisations. Le code renvoyé est alors `unauthorized_client`, mais on ne
 *   s'appuie pas que sur lui : Microsoft a déjà changé ces libellés.
 */
const MOTIFS_AUTORISATION =
  /AADSTS700016|AADSTS7000222|AADSTS650052|AADSTS90002|application.{0,40}not found|does not exist in tenant/i;

/**
 * Codes qui ressemblent à un refus d'autorisation mais n'en sont pas.
 *
 * ⚠ CETTE LISTE EST PRIORITAIRE SUR TOUT LE RESTE, ET UN ESSAI L'EXIGE.
 *   `invalid_client` arrive avec un statut 401, que la règle de repli
 *   classait « definitif ». Or il désigne un secret d'application
 *   Safentreprise expiré ou faux : il frappe TOUS les locataires au même
 *   instant, et aucun client ne peut rien y faire.
 *
 *   Le garde-fou `panneGenerale` ne rattrape pas ce cas quand le parc compte
 *   deux clients ou moins — c'est-à-dire aujourd'hui. Sans cette liste, le
 *   jour où le secret expire, chaque client recevrait un mail lui annonçant
 *   que son administrateur a retiré son accord. Deux protections valent mieux
 *   qu'une quand l'erreur est irrattrapable en image.
 */
const CODES_NOTRE_FAUTE = new Set([
  "invalid_client",
  "invalid_request",
  "unsupported_grant_type",
]);

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Cette erreur met-elle en cause l'autorisation, ou seulement le moment ?
 *
 * ⚠ LE DOUTE PROFITE AU CLIENT. Tout ce qui n'est pas reconnu comme un refus
 *   d'autorisation est rendu « passager ». Se tromper dans ce sens fait
 *   afficher « on vérifie » à un client réellement coupé pendant une heure et
 *   demie de plus ; se tromper dans l'autre sens annonce une révocation qui
 *   n'a pas eu lieu, et envoie un client payant refaire tout son parcours.
 */
export function classer(erreur: unknown): Verdict {
  if (!(erreur instanceof ErreurGraph)) {
    // Réseau, DNS, délai dépassé, JSON illisible : rien qui parle des droits.
    return "passager";
  }

  // ⚠ NOTRE FAUTE D'ABORD, AVANT TOUTE AUTRE RÈGLE. Un secret expiré répond
  //   401, que le repli plus bas classerait « definitif ». Voir
  //   `CODES_NOTRE_FAUTE`.
  if (erreur.code && CODES_NOTRE_FAUTE.has(erreur.code)) return "passager";

  // 429 et 5xx sont explicitement rejouables : Graph le dit lui-même.
  if (erreur.statut === 429 || erreur.statut >= 500) return "passager";

  if (erreur.code && CODES_AUTORISATION.has(erreur.code)) return "definitif";
  if (MOTIFS_AUTORISATION.test(erreur.message)) return "definitif";

  if (erreur.statut === 401 || erreur.statut === 403) return "definitif";

  return "passager";
}

/**
 * Une panne qui frappe TOUT le parc vient de chez nous, pas de chez eux.
 *
 * ⚠ LE GARDE-FOU QUI ÉVITE LA CATASTROPHE. Un secret d'application expiré, une
 *   variable d'environnement perdue au déploiement, et chaque locataire répond
 *   « autorisation refusée » dans le même passage. Sans cette règle, trois
 *   passages suffiraient à marquer TOUS les clients « révoqué » et à leur
 *   annoncer par mail que leur administrateur a retiré son accord — ce qui
 *   serait faux, et irrattrapable en image.
 *
 *   Au-delà de deux locataires, on exige donc qu'au moins un aille bien pour
 *   croire à une révocation individuelle. Sous ce seuil, l'indice statistique
 *   ne vaut rien et on laisse la règle normale s'appliquer.
 */
export function panneGenerale(verdicts: Verdict[]): boolean {
  if (verdicts.length <= 2) return false;
  return verdicts.every((v) => v !== "ok");
}

/**
 * Sonde un locataire.
 *
 * `graphUserId` est la boîte témoin de la sonde : une boîte que le client a
 * choisie et que la restriction a autorisée. Sans elle, on ne peut vérifier
 * que le jeton — voir l'avertissement en tête de fichier sur ce que cela
 * laisse passer.
 */
export async function sonder(
  tenantId: string,
  graphUserId: string | null,
): Promise<Constat> {
  // Sans cet oubli, la sonde mesure l'état des autorisations d'il y a une
  // heure. C'est la première chose à faire, avant toute autre.
  oublierJeton(tenantId);

  try {
    if (!graphUserId) {
      // Pas de boîte surveillée : le jeton est tout ce qu'on peut éprouver.
      // Le verdict reste honnête sur ce qu'il vaut.
      await appelGraph<{ value?: unknown[] }>(
        tenantId,
        "GET",
        "/users?$top=1&$select=id",
      );
      return {
        verdict: "ok",
        detail: "Jeton obtenu, annuaire lisible. Aucune boîte à sonder.",
      };
    }

    // ⚠ L'APPEL LE MOINS COÛTEUX QUI EXERCE VRAIMENT `Mail.ReadWrite`. On lit
    //   l'identifiant du dossier Réception, pas son contenu : aucun message
    //   n'est ouvert, aucune donnée personnelle n'entre dans la réponse, et
    //   Microsoft répond en quelques dizaines de millisecondes.
    await appelGraph<{ id?: string }>(
      tenantId,
      "GET",
      `/users/${encodeURIComponent(graphUserId)}/mailFolders/inbox?$select=id`,
    );

    return { verdict: "ok", detail: "Jeton obtenu, boîte surveillée lisible." };
  } catch (erreur) {
    return { verdict: classer(erreur), detail: messageDe(erreur).slice(0, 400) };
  }
}
