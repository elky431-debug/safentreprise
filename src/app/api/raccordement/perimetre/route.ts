/** Enregistre le périmètre choisi et la boîte témoin, depuis un jeton. */
import { jetonPropre, locataireDuJeton } from "@/lib/raccordement/jeton-serveur";
import { createClient } from "@/lib/supabase/server";
import { listerBoites } from "@/lib/microsoft/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(requete: Request) {
  let corps: { jeton?: unknown; graph_user_ids?: unknown; temoin_upn?: unknown };
  try {
    corps = (await requete.json()) as typeof corps;
  } catch {
    return Response.json({ erreur: "corps illisible" }, { status: 400 });
  }

  const jeton = jetonPropre(corps.jeton);
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  const ids = Array.isArray(corps.graph_user_ids)
    ? corps.graph_user_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return Response.json({ erreur: "aucune boîte choisie" }, { status: 400 });
  }

  const tenantId = await locataireDuJeton(jeton);
  if (!tenantId) {
    return Response.json({ erreur: "jeton invalide" }, { status: 404 });
  }

  // ⚠ LES UPN VIENNENT DE L'ANNUAIRE, PAS DU NAVIGATEUR. Le client n'envoie
  //   que des identifiants Graph ; on relit l'annuaire pour y associer les
  //   adresses. Accepter l'UPN transmis laisserait poser un couple
  //   (identifiant, adresse) incohérent — et c'est l'adresse qui sert à
  //   écrire le script de restriction.
  let annuaire;
  try {
    annuaire = await listerBoites(tenantId);
  } catch (erreur) {
    console.error("[raccordement] listerBoites :", erreur);
    return Response.json({ erreur: "annuaire illisible" }, { status: 502 });
  }

  const connues = new Map(annuaire.map((b) => [b.graph_user_id, b.upn]));
  const boites = ids
    .filter((id) => connues.has(id))
    .map((id) => ({ graph_user_id: id, upn: connues.get(id) }));

  if (boites.length === 0) {
    return Response.json(
      { erreur: "aucune des boîtes envoyées n'existe dans l'annuaire" },
      { status: 400 },
    );
  }

  const temoin =
    typeof corps.temoin_upn === "string" && corps.temoin_upn.trim()
      ? corps.temoin_upn.trim().toLowerCase()
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("choisir_boites_par_jeton", {
    p_jeton: jeton,
    p_boites: boites,
    p_temoin_upn: temoin,
  });

  if (error) {
    console.error("[raccordement] choisir_boites_par_jeton :", error);
    return Response.json({ erreur: error.message }, { status: 400 });
  }

  return Response.json(Array.isArray(data) ? (data[0] ?? {}) : data);
}
