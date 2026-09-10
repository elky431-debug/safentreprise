/**
 * Où en est le raccordement Microsoft 365 d'une société — lu en base.
 *
 * ⚠ CE MODULE EST RÉSERVÉ AU SERVEUR : il dépend du client Supabase serveur.
 *   Les composants du navigateur importent les types et les libellés depuis
 *   ./etat, jamais d'ici.
 *
 * ⚠ L'ÉTAPE EST DÉDUITE DE LA BASE, JAMAIS MÉMORISÉE DANS LE NAVIGATEUR. Entre
 *   l'étape 6 et le retour de son administrateur, le client fermera son onglet
 *   — parfois pour plusieurs jours. Un état gardé côté navigateur le ramènerait
 *   à une page blanche, ou pire, à une étape déjà faite. Ce qui fait foi, c'est
 *   ce que la base sait : un locataire, des boîtes choisies, une restriction
 *   constatée, des abonnements.
 *
 * Tout ce qui est lu ici passe par la session du client : la RLS fait le
 * cloisonnement, et une société ne peut pas voir le raccordement d'une autre.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { deduireEtape, type BoiteEtat, type Raccordement } from "./etat";

const VIDE: Raccordement = {
  etape: "non-raccorde",
  tenant_uid: null,
  tenant_id: null,
  statut: null,
  consenti_par: null,
  consenti_at: null,
  restriction_verifiee_at: null,
  restriction_preuve: null,
  temoin_upn: null,
  temoin_origine: null,
  derniere_erreur: null,
  boites: [],
};

type LigneTenant = {
  id: string;
  tenant_id: string;
  statut: "actif" | "revoque" | "erreur";
  consenti_par: string | null;
  consenti_at: string | null;
  restriction_verifiee_at: string | null;
  restriction_preuve: string | null;
  temoin_upn: string | null;
  temoin_origine: string | null;
  derniere_erreur: string | null;
};

/**
 * ⚠ MÉMOÏSÉ SUR LA DURÉE D'UNE REQUÊTE. Le tableau de bord l'appelle deux fois :
 *   une fois pour `BandeauRaccordement`, une fois pour la couverture qui allège
 *   l'axe technique du score. `cache()` de React ne garde rien entre deux
 *   requêtes HTTP — chaque affichage de page relit donc la base, ce qui est
 *   indispensable ici : le client revient sur cette page après que son
 *   administrateur a agi ailleurs.
 */
export const lireRaccordement = cache(async function lireRaccordement(): Promise<Raccordement> {
  const supabase = await createClient();

  // Une société n'a qu'un locataire aujourd'hui ; on prend le plus récent pour
  // ne pas dépendre de cette hypothèse.
  const { data: ligne } = await supabase
    .from("microsoft_tenants")
    .select(
      "id, tenant_id, statut, consenti_par, consenti_at, restriction_verifiee_at, " +
        "restriction_preuve, temoin_upn, temoin_origine, derniere_erreur",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tenant = ligne as LigneTenant | null;
  if (!tenant) return VIDE;

  const { data: lignesBoites } = await supabase
    .from("boites_surveillees")
    .select("id, graph_user_id, upn, choisie, actif, restriction_verifiee_at")
    .eq("tenant_uid", tenant.id)
    .order("upn");

  const brutes = (lignesBoites ?? []) as Omit<
    BoiteEtat,
    "abonnee" | "abonnement_expire_at"
  >[];

  // Les abonnements disent ce qui est VRAIMENT surveillé. Une boîte cochée,
  // vérifiée, mais non abonnée ne reçoit aucune notification : Microsoft ne
  // nous parle jamais d'elle, et rien n'est analysé.
  let abonnements: { boite_id: string; expire_at: string }[] = [];
  if (brutes.length > 0) {
    const { data } = await supabase
      .from("graph_abonnements")
      .select("boite_id, expire_at")
      .eq("statut", "actif")
      .in(
        "boite_id",
        brutes.map((b) => b.id),
      );
    abonnements = (data as typeof abonnements) ?? [];
  }

  const parBoite = new Map(abonnements.map((a) => [a.boite_id, a.expire_at]));

  const boites: BoiteEtat[] = brutes.map((b) => ({
    ...b,
    abonnee: parBoite.has(b.id),
    abonnement_expire_at: parBoite.get(b.id) ?? null,
  }));

  return {
    etape: deduireEtape(tenant, boites),
    tenant_uid: tenant.id,
    tenant_id: tenant.tenant_id,
    statut: tenant.statut,
    consenti_par: tenant.consenti_par,
    consenti_at: tenant.consenti_at,
    restriction_verifiee_at: tenant.restriction_verifiee_at,
    restriction_preuve: tenant.restriction_preuve,
    temoin_upn: tenant.temoin_upn,
    temoin_origine: tenant.temoin_origine,
    derniere_erreur: tenant.derniere_erreur,
    boites,
  };
});
