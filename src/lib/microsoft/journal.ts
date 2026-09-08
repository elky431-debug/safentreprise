/**
 * Journal des accès aux données personnelles — côté application.
 *
 * La base journalise elle-même les lectures qui passent par une fonction SQL
 * (corps stocké, annuaire, sauvegarde de corps). Reste ce qu'elle ne peut pas
 * voir : les appels à Microsoft Graph. C'est l'objet de ce module.
 *
 * ⚠ LE JOURNAL NE DOIT CONTENIR AUCUNE ADRESSE. La base l'impose par une
 *   contrainte — elle refuse toute valeur contenant « @ ». Ce module doit donc
 *   trier ce qu'il envoie AVANT l'appel, sans quoi la contrainte ferait
 *   échouer l'écriture et l'accès ne serait pas tracé du tout. C'est le rôle
 *   de sansAdresse().
 *
 * ⚠ ÉCRITURE AU FIL DE L'EAU, une ligne par appel. Le groupage aurait épargné
 *   des allers-retours, mais un journal qui perd ses lignes quand le worker
 *   tombe est inutile au moment précis où il servirait.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** Les rôles techniques reconnus par la base. Jamais une personne physique. */
export type ActeurJournal =
  | "worker"
  | "maintenance"
  | "veille"
  | "raccordement"
  | "restauration"
  | "exploitation"
  | "inconnu";

export type ContexteJournal = { acteur: ActeurJournal; tache?: string };

/**
 * Le contexte suit l'exécution, pas le module.
 *
 * Une variable de module aurait été plus simple, et fausse : deux requêtes
 * concurrentes dans la même instance se seraient attribué l'acteur l'une de
 * l'autre. Un journal qui désigne le mauvais acteur est pire qu'un journal
 * absent — il accuse.
 */
const stockage = new AsyncLocalStorage<ContexteJournal>();

/** Exécute `fn` en attribuant tous ses accès à cet acteur. */
export function avecContexteJournal<T>(
  contexte: ContexteJournal,
  fn: () => Promise<T>,
): Promise<T> {
  return stockage.run(contexte, fn);
}

function contexteCourant(): ContexteJournal {
  return stockage.getStore() ?? { acteur: "inconnu" };
}

/* --------------------------------------------------------------------------
   Ce qui entre dans le journal
   -------------------------------------------------------------------------- */

export type RessourceJournal =
  | "message"
  | "corps"
  | "annuaire"
  | "boite"
  | "analyse"
  | "abonnement"
  | "categorie"
  | "application";

export type EntreeJournal = {
  ressource: RessourceJournal;
  operation: "lecture" | "ecriture" | "modification" | "suppression";
  resultat: "ok" | "refuse" | "introuvable" | "erreur";
  tenantId?: string | null;
  boiteRef?: string | null;
  ressourceRef?: string | null;
  code?: string | null;
  volume?: number | null;
};

/**
 * Rend une référence sûre à journaliser.
 *
 * Un identifiant Graph est un pseudonyme : il désigne une boîte pour qui
 * détient l'annuaire du client, et il est nécessaire — une trace qui ne dit
 * pas QUELLE boîte a été lue ne démontre rien. Une adresse, elle, n'a rien à
 * faire là : on la remplace par une empreinte courte, stable d'un appel à
 * l'autre, qui permet de rapprocher deux accès sans nommer personne.
 */
export function sansAdresse(valeur: string | null | undefined): string | null {
  const v = (valeur ?? "").trim();
  if (!v) return null;
  if (!v.includes("@")) return v.slice(0, 200);

  // Empreinte non réversible, calculée sans dépendance : le journal doit
  // pouvoir s'écrire même là où crypto n'est pas disponible.
  let h = 5381;
  for (let i = 0; i < v.length; i += 1) {
    h = ((h << 5) + h + v.charCodeAt(i)) | 0;
  }
  return `adr-${(h >>> 0).toString(16)}`;
}

/**
 * À quelle ressource correspond un chemin Graph ?
 *
 * Le classement est volontairement grossier : le journal dit ce qui a été
 * touché, pas comment. Un chemin non reconnu est journalisé comme « message »
 * en lecture plutôt que d'être omis — mieux vaut une ligne imprécise qu'un
 * accès invisible.
 */
export function classerChemin(
  chemin: string,
  methode: string,
): { ressource: RessourceJournal; boiteRef: string | null; ressourceRef: string | null } {
  const sansParametres = chemin.split("?")[0] ?? chemin;
  const boite = /\/users\/([^/]+)/.exec(sansParametres)?.[1] ?? null;
  const boiteRef = sansAdresse(boite ? decodeURIComponent(boite) : null);

  if (/^\/servicePrincipals/.test(sansParametres)) {
    return { ressource: "application", boiteRef: null, ressourceRef: null };
  }
  if (/^\/subscriptions/.test(sansParametres)) {
    const id = /^\/subscriptions\/([^/]+)/.exec(sansParametres)?.[1] ?? null;
    return { ressource: "abonnement", boiteRef, ressourceRef: sansAdresse(id) };
  }
  if (/masterCategories/.test(sansParametres)) {
    return { ressource: "categorie", boiteRef, ressourceRef: null };
  }
  // La liste des comptes du locataire : l'annuaire.
  if (/^\/users(\?|$)/.test(chemin) || /^https?:\/\/[^?]*\/users\?/.test(chemin)) {
    return { ressource: "annuaire", boiteRef: null, ressourceRef: null };
  }
  const message = /\/messages\/([^/]+)/.exec(sansParametres)?.[1] ?? null;
  if (message) {
    return { ressource: "message", boiteRef, ressourceRef: sansAdresse(message) };
  }
  // /users/{id}/messages — le sondage de restriction, et les listes.
  if (/\/messages$/.test(sansParametres) || /\/mailFolders/.test(sansParametres)) {
    return { ressource: "boite", boiteRef, ressourceRef: null };
  }
  return {
    ressource: "message",
    boiteRef,
    ressourceRef: methode === "GET" ? null : sansAdresse(sansParametres),
  };
}

/* --------------------------------------------------------------------------
   L'écriture
   -------------------------------------------------------------------------- */

/** Nombre d'écritures perdues depuis le démarrage de l'instance. */
let perdues = 0;
export function ecrituresPerdues(): number {
  return perdues;
}

/**
 * Écrit une ligne de journal. Ne lève jamais.
 *
 * ⚠ CE CHOIX EST L'INVERSE DE CELUI FAIT EN BASE, et pour une raison. En base,
 *   l'écriture du journal se fait dans la transaction de la lecture : si elle
 *   échoue, la lecture échoue avec elle, et c'est bien — lire sans trace
 *   serait pire. Ici, l'écriture est un appel réseau distinct : faire échouer
 *   une analyse de message parce que le journal n'a pas répondu arrêterait le
 *   produit sur un incident sans gravité.
 *
 *   La contrepartie est réelle et doit être dite : une écriture perdue est un
 *   accès non tracé. Elles sont comptées, et le compteur est exposé par le
 *   diagnostic du worker.
 */
export async function journaliserAcces(entree: EntreeJournal): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    perdues += 1;
    return;
  }

  const { acteur, tache } = contexteCourant();

  try {
    const reponse = await fetch(`${url}/rest/v1/rpc/journaliser`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_acteur: acteur,
        p_ressource: entree.ressource,
        p_operation: entree.operation,
        p_resultat: entree.resultat,
        p_tache: sansAdresse(tache),
        p_company_id: null,
        p_tenant_id: entree.tenantId ?? null,
        p_boite_ref: sansAdresse(entree.boiteRef),
        p_ressource_ref: sansAdresse(entree.ressourceRef),
        p_code: sansAdresse(entree.code),
        p_volume: entree.volume ?? null,
      }),
    });

    if (!reponse.ok) {
      perdues += 1;
      console.error(
        `[journal] écriture refusée : HTTP ${reponse.status} — ` +
          `${entree.ressource}/${entree.operation}`,
      );
    }
  } catch (erreur) {
    perdues += 1;
    console.error(
      "[journal] écriture impossible :",
      erreur instanceof Error ? erreur.message : String(erreur),
    );
  }
}
