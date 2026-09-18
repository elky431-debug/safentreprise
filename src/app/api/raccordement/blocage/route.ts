/**
 * « Je suis bloqué » — le signalement, sans session.
 *
 * ⚠ C'EST LA SEULE ÉCRITURE QUE LE JETON PERMET SANS AVANCER LE PARCOURS, et
 *   elle existe pour qu'un informaticien coincé ait un geste à faire autre que
 *   fermer l'onglet. Un blocage silencieux est le plus fréquent et le plus
 *   coûteux : personne n'apprend jamais pourquoi le raccordement s'est arrêté.
 */
import { jetonPropre } from "@/lib/raccordement/jeton-serveur";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(requete: Request) {
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ erreur: "corps illisible" }, { status: 400 });
  }

  const jeton = jetonPropre(corps.jeton);
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  const texte = (v: unknown) => (typeof v === "string" ? v : null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("signaler_blocage_raccordement", {
    p_jeton: jeton,
    p_etape: texte(corps.etape),
    // La base ramène tout motif inconnu sur « autre » : on n'a pas à le
    // valider deux fois, et une liste dupliquée finirait par diverger.
    p_motif: texte(corps.motif) ?? "autre",
    p_texte: texte(corps.texte),
    p_erreur: texte(corps.erreur),
  });

  if (error) {
    console.error("[raccordement] signaler_blocage_raccordement :", error);
    return Response.json({ erreur: error.message }, { status: 500 });
  }

  if (data !== true) {
    return Response.json({ erreur: "jeton invalide" }, { status: 404 });
  }

  // ⚠ L'ALERTE VERS L'ÉDITEUR ARRIVE AU LOT 5. La ligne est écrite dès
  //   maintenant — c'est elle qui compte, et elle ne se perd pas. Le mail est
  //   un confort d'exploitation, pas la trace.
  return Response.json({ ok: true });
}
