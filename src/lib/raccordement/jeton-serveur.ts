/**
 * Le socle serveur des routes du parcours informaticien.
 *
 * ⚠ TOUTES LES ROUTES `/api/raccordement/*` PASSENT PAR ICI, ET AUCUNE NE LIT
 *   UNE TABLE DIRECTEMENT. Le jeton ne donne accès à rien par lui-même : il
 *   est un argument de fonction `SECURITY DEFINER`, et c'est la base qui
 *   décide de ce qu'elle rend. Contourner ce fichier pour « aller plus vite »
 *   remettrait la décision d'autorisation dans le code de la route, là où
 *   personne ne la relit.
 *
 * ⚠ AUCUNE ROUTE NE PREND `company_id` EN PARAMÈTRE. La société vient toujours
 *   du jeton. La laisser choisir permettrait de rattacher le locataire
 *   Microsoft d'une entreprise à la société d'une autre — c'est l'avertissement
 *   déjà écrit sur la version en session, et il vaut deux fois plus ici
 *   puisque l'appelant est anonyme.
 */
import { createClient } from "@/lib/supabase/server";

export type EtatJeton = {
  accord_donne: boolean;
  tenant_id: string | null;
  statut: string | null;
  restriction_verifiee_at: string | null;
  boites_choisies: number;
  boites_actives: number;
  temoin_upn: string | null;
};

/** Le jeton tel qu'il arrive : jamais une chaîne vide, jamais 500 caractères. */
export function jetonPropre(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const j = brut.trim();
  // 32 caractères hexadécimaux — la forme rendue par `gen_random_uuid()` sans
  // ses tirets. Refuser ici évite d'envoyer n'importe quoi à la base.
  return /^[0-9a-f]{32}$/.test(j) ? j : null;
}

/**
 * L'état du raccordement pour ce jeton, ou `null` si le jeton ne vaut rien.
 *
 * ⚠ `null` NE VEUT PAS DIRE « ERREUR ». Un jeton expiré rend `null` sans que
 *   rien n'ait échoué. Les routes doivent répondre 404, pas 500 : un 500
 *   ferait croire à une panne de notre côté et déclencherait une relance
 *   inutile.
 */
export async function etatDuJeton(jeton: string): Promise<EtatJeton | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("etat_raccordement_par_jeton", {
    p_jeton: jeton,
  });
  if (error) {
    console.error("[raccordement] etat_raccordement_par_jeton :", error);
    return null;
  }
  const ligne = (Array.isArray(data) ? data[0] : data) as EtatJeton | undefined;
  return ligne ?? null;
}

/**
 * Le GUID du locataire pour ce jeton, une fois l'accord donné.
 *
 * ⚠ IL VIENT DE LA BASE, JAMAIS DE LA REQUÊTE. Une route qui accepterait un
 *   `tenant_id` en paramètre laisserait n'importe qui faire appeler Graph sur
 *   le locataire de son choix avec NOS autorisations.
 */
export async function locataireDuJeton(jeton: string): Promise<string | null> {
  const etat = await etatDuJeton(jeton);
  if (!etat?.accord_donne || !etat.tenant_id) return null;
  return etat.tenant_id;
}
