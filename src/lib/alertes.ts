import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlerteGraph, NiveauRisqueMenace } from "@/lib/types";

/**
 * Lecture des alertes du pipeline Microsoft 365.
 *
 * ⚠ UNE SEULE REQUÊTE POUR LES DEUX ÉCRANS. `/menaces` et `/dashboard` lisaient
 *   chacun sa propre requête, sur `menaces_detectees` ; c'est ainsi que les
 *   deux sont restés branchés sur l'ancienne table quand le pipeline a changé.
 *   Les rebrancher ailleurs ne demande plus qu'une modification ici.
 *
 * ⚠ LE FILTRE `alerte = true` EST CE QUI DISTINGUE UNE ALERTE D'UNE ANALYSE.
 *   `graph_analyses` porte une ligne par message analysé, alerte ou non. Sans
 *   ce filtre, l'écran afficherait tout le courrier reçu par les boîtes
 *   surveillées — l'inverse exact de ce que le produit promet.
 *
 * ⚠ `objet` PEUT ÊTRE MIS EN LISTE — PARCE QUE CETTE FONCTION NE REND QUE DES
 *   ALERTES. La règle a changé et la nuance est tout ce qui la tient : jamais
 *   d'objet sur une liste d'ANALYSES, oui sur une liste d'ALERTES. Une liste de
 *   tous les messages analysés donnerait au dirigeant le courrier de ses
 *   salariés ; ici le filtre `alerte = true` ne laisse passer que ce que le
 *   moteur désigne comme tentative de fraude, et le dirigeant a besoin de lire
 *   ce que l'attaquant a écrit.
 *
 *   ⚠ DONC : SI QUELQU'UN AJOUTE UN JOUR UNE LECTURE SANS CE FILTRE, elle ne
 *     doit pas passer par cette fonction, ou l'objet doit en être retiré. C'est
 *     le filtre qui autorise la colonne, pas l'inverse.
 *
 * ⚠ LE CORPS DU MESSAGE N'EST PAS DANS `COLONNES`, ET N'A PAS À Y ENTRER. Il
 *   n'existe pas dans cette table ; la garantie est écrite dans l'AIPD et le
 *   DPA.
 */

/** Forme brute renvoyée par PostgREST, avant remise à plat de la jointure. */
type LigneGraph = {
  id: string;
  analyse_at: string;
  recu_at: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  nom_signe: string | null;
  objet: string | null;
  niveau: string;
  score: number;
  signaux: unknown;
  employe_email: string | null;
  boites_surveillees: { upn: string } | null;
};

/** Colonnes lues. Le corps du message n'existe pas dans cette table. */
const COLONNES =
  "id, analyse_at, recu_at, expediteur_nom, expediteur_email, nom_signe, objet, niveau, score, signaux, employe_email, boites_surveillees(upn)";

const NIVEAUX: NiveauRisqueMenace[] = ["faible", "modere", "eleve"];

function niveauValide(valeur: string): NiveauRisqueMenace {
  return NIVEAUX.includes(valeur as NiveauRisqueMenace)
    ? (valeur as NiveauRisqueMenace)
    : "faible";
}

/**
 * Les alertes d'une société, de la plus récente à la plus ancienne.
 *
 * La RLS restreint déjà à la société du dirigeant ; le filtre explicite garde
 * la requête lisible et l'index partiel (company_id, analyse_at) utilisable.
 */
export async function chargerAlertesGraph(
  // Le client vient de `@/lib/supabase/server`, dont le type générique varie
  // avec la génération des types de base : on reste volontairement souple.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
  limite: number,
): Promise<AlerteGraph[]> {
  const { data } = await supabase
    .from("graph_analyses")
    .select(COLONNES)
    .eq("company_id", companyId)
    .eq("alerte", true)
    .order("analyse_at", { ascending: false })
    .limit(limite)
    .returns<LigneGraph[]>();

  return (data ?? []).map((l) => ({
    id: l.id,
    detecte_at: l.analyse_at,
    recu_at: l.recu_at,
    boite: l.boites_surveillees?.upn ?? null,
    expediteur_nom: l.expediteur_nom,
    expediteur_email: l.expediteur_email,
    nom_signe: l.nom_signe,
    objet: l.objet,
    niveau_risque: niveauValide(l.niveau),
    score: l.score,
    // signaux est du JSONB : on garantit un tableau de chaînes côté client.
    signaux: Array.isArray(l.signaux)
      ? l.signaux.filter((s): s is string => typeof s === "string")
      : [],
    employe_email: l.employe_email,
  }));
}
