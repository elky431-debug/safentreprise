/**
 * La sonde de santé d'un raccordement : elle constate, elle ne décide pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ SAFENTREPRISE FRANCHIT DEUX PORTES INDÉPENDANTES, ET C'EST TOUT L'OBJET
 *   DE CE MODULE. Un test réel l'a établi : révoquer les autorisations Entra
 *   de l'application (User.Read.All, User.Read) N'ARRÊTE PAS l'analyse du
 *   courrier — les bannières continuent de se poser.
 *
 *     • LE COURRIER vient du RBAC Exchange, posé par le script PowerShell de
 *       l'étape 3 : `New-ManagementRoleAssignment -Role 'Application
 *       Mail.ReadWrite'`. Il se coupe avec Remove-ManagementRoleAssignment.
 *
 *     • L'ANNUAIRE vient d'un rôle d'application Entra (User.Read.All), et
 *       alimente `/users` — donc `listerBoites` et `listerAnnuaire`. Il se
 *       coupe en révoquant le consentement administrateur.
 *
 *   ET LES REMÈDES SONT OPPOSÉS. Refaire le consentement ne rétablit pas le
 *   courrier ; réexécuter le script ne rétablit pas l'annuaire. Une sonde qui
 *   ne dirait pas LAQUELLE a lâché enverrait le client corriger ce qui n'est
 *   pas cassé — c'est ce que faisait la première version.
 *
 * ⚠ LE JETON EN CACHE MENT PENDANT UNE HEURE. Microsoft ne révoque pas les
 *   jetons déjà délivrés : ils gardent les permissions d'avant jusqu'à
 *   expiration. `oublierJeton` est donc appelé AVANT chaque sonde. Ce n'est pas
 *   théorique — c'est écrit dans `graph.ts` à partir d'un cas réel.
 *
 * ⚠ CE MODULE NE CHOISIT PAS LE STATUT. Il rend un verdict et une portée ;
 *   c'est `constater_sante_tenant`, en SQL, qui décide si cela vaut une
 *   révocation, et qui sait que l'annuaire coupé NE DOIT PAS arrêter la
 *   surveillance du courrier.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {
  ErreurGraph,
  appelGraph,
  obtenirJeton,
  oublierJeton,
  sonderBoite,
} from "./graph";

/** Ce que la sonde a vu sur l'axe courrier. Rien de plus, rien d'interprété. */
export type Verdict = "ok" | "passager" | "definitif";

/** Laquelle des deux portes a lâché. L'annuaire n'y est pas : il a son axe. */
export type Portee = "courrier" | "tout";

export type Constat = {
  verdict: Verdict;
  /** Renseignée seulement quand le verdict est « definitif ». */
  portee: Portee | null;
  detail: string;
  /**
   * L'annuaire répond-il ? `null` = pas testé, on ne touche pas au drapeau.
   *
   * ⚠ AXE SÉPARÉ, SANS EFFET SUR LE VERDICT. Un annuaire coupé n'arrête rien :
   *   les messages continuent d'être analysés. Ce qui se dégrade, c'est la
   *   reconnaissance des dirigeants et collaborateurs — donc l'usurpation
   *   d'annuaire, la règle la plus forte du moteur.
   */
  annuaireOk: boolean | null;
  annuaireDetail: string | null;
};

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

/**
 * Codes d'erreur Azure AD qui désignent l'AUTORISATION elle-même.
 *
 * ⚠ `invalid_client` N'Y EST PAS : voir `CODES_NOTRE_FAUTE`.
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
  //   401, que le repli plus bas classerait « definitif ».
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

/* ==========================================================================
   Les deux portes
   ========================================================================== */

/**
 * La porte de l'annuaire : `/users`, donc `User.Read.All` côté Entra.
 *
 * ⚠ ON NE REND PAS D'ERREUR, ON REND UN ÉTAT. Une panne d'annuaire ne doit
 *   jamais interrompre la sonde du courrier : ce sont deux diagnostics
 *   indépendants, et l'un ne préjuge pas de l'autre.
 */
async function sonderAnnuaire(
  tenantId: string,
): Promise<{ ok: boolean; detail: string | null }> {
  try {
    await appelGraph<{ value?: unknown[] }>(
      tenantId,
      "GET",
      "/users?$top=1&$select=id",
    );
    return { ok: true, detail: null };
  } catch (erreur) {
    // ⚠ SEUL UN REFUS COMPTE. Un 429 ou un 503 sur l'annuaire ne veut pas dire
    //   que le consentement a été retiré : lever le drapeau là-dessus ferait
    //   afficher « annuaire coupé » à un client dont tout va bien.
    if (classer(erreur) !== "definitif") return { ok: true, detail: null };
    return { ok: false, detail: messageDe(erreur).slice(0, 400) };
  }
}

/**
 * Sonde un locataire, sur ses deux portes.
 *
 * `graphUserId` est la boîte témoin de la sonde : une boîte que le client a
 * choisie ET que la restriction a autorisée. Sans elle, on ne peut éprouver
 * que le jeton et l'annuaire — et le verdict le dit.
 */
export async function sonder(
  tenantId: string,
  graphUserId: string | null,
): Promise<Constat> {
  // Sans cet oubli, la sonde mesure l'état des autorisations d'il y a une
  // heure. C'est la première chose à faire, avant toute autre.
  oublierJeton(tenantId);

  // --- Porte 0 : le jeton lui-même ----------------------------------------
  //
  // ⚠ S'IL TOMBE, LES DEUX PORTES SONT FERMÉES, et c'est une portée à elle.
  //   L'application a été supprimée ou désactivée dans le locataire : refaire
  //   le consentement ne suffira pas, il faut reprendre tout le parcours. On
  //   l'éprouve EN PREMIER et SÉPARÉMENT, parce qu'un échec de jeton et un 403
  //   sur `/users` se ressemblent à l'arrivée alors qu'ils ne demandent pas du
  //   tout le même geste au client.
  try {
    await obtenirJeton(tenantId);
  } catch (erreur) {
    const detail = messageDe(erreur).slice(0, 400);
    if (classer(erreur) === "definitif") {
      return {
        verdict: "definitif",
        portee: "tout",
        detail,
        // Tout est fermé : l'annuaire l'est aussi, et le dire évite un
        // encadré ambre qui ferait doublon avec le rouge.
        annuaireOk: false,
        annuaireDetail: detail,
      };
    }
    // Panne passagère — on ne touche à aucun drapeau.
    return {
      verdict: "passager",
      portee: null,
      detail,
      annuaireOk: null,
      annuaireDetail: null,
    };
  }

  // --- Les deux portes, indépendamment -------------------------------------
  const annuaire = await sonderAnnuaire(tenantId);
  return sonderCourrier(tenantId, graphUserId, annuaire);
}

/**
 * La porte du courrier : un MESSAGE, via le RBAC Exchange.
 *
 * ⚠ `sonderBoite` PLUTÔT QU'UNE SONDE ÉCRITE ICI, ET SON COMMENTAIRE DIT
 *   POURQUOI. Une première version lisait `/mailFolders/inbox` : un appel
 *   Exchange lui aussi, donc soumis aux mêmes autorisations, mais un dossier
 *   n'est pas un message. La preuve doit porter sur ce que le client craint
 *   réellement — qu'on lise son courrier.
 *
 * ⚠ ET ELLE DISTINGUE 404 DE 403, CE QUI ÉVITE UN FAUX DIAGNOSTIC. Un compte
 *   sans boîte aux lettres rend 404 : ce n'est pas un refus, cela ne prouve
 *   rien, et compter ce 404 comme une coupure ferait annoncer une révocation à
 *   un client dont tout fonctionne.
 */
async function sonderCourrier(
  tenantId: string,
  graphUserId: string | null,
  annuaire: { ok: boolean; detail: string | null },
): Promise<Constat> {
  if (!graphUserId) {
    // Aucune boîte vérifiée : rien à éprouver côté Exchange. Le verdict reste
    // honnête sur ce qu'il vaut.
    return {
      verdict: "ok",
      portee: null,
      detail: "Jeton obtenu. Aucune boîte vérifiée à sonder.",
      annuaireOk: annuaire.ok,
      annuaireDetail: annuaire.detail,
    };
  }

  const sondage = await sonderBoite(tenantId, graphUserId);

  switch (sondage.etat) {
    case "lisible":
      return {
        verdict: "ok",
        portee: null,
        detail: "Jeton obtenu, boîte surveillée lisible.",
        annuaireOk: annuaire.ok,
        annuaireDetail: annuaire.detail,
      };

    case "refuse":
      return {
        verdict: "definitif",
        portee: "courrier",
        detail: `Lecture refusée : ${sondage.code} — ${sondage.message}`.slice(0, 400),
        annuaireOk: annuaire.ok,
        annuaireDetail: annuaire.detail,
      };

    case "introuvable":
      // Le compte n'a pas de boîte. Ce n'est pas un refus : on ne conclut rien
      // et on ne compte surtout pas d'échec d'autorisation.
      return {
        verdict: "passager",
        portee: null,
        detail: `Boîte témoin introuvable, sondage non concluant : ${sondage.message}`.slice(0, 400),
        annuaireOk: annuaire.ok,
        annuaireDetail: annuaire.detail,
      };

    default:
      return {
        verdict: "passager",
        portee: null,
        detail: sondage.message.slice(0, 400),
        annuaireOk: annuaire.ok,
        annuaireDetail: annuaire.detail,
      };
  }
}
