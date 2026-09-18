/** Le suivi du dirigeant, et la révocation du lien. En session. */
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suivi_raccordement");

  if (error) {
    console.error("[raccordement] suivi_raccordement :", error);
    return Response.json({ erreur: error.message }, { status: 400 });
  }

  // ⚠ AUCUNE LIGNE N'EST UN ÉTAT NORMAL, PAS UNE ERREUR : le dirigeant n'a
  //   encore rien transmis, ou vient de révoquer. L'écran affiche alors le
  //   premier écran du parcours.
  const ligne = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  return Response.json({ suivi: ligne }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoquer_jeton_raccordement");
  if (error) {
    console.error("[raccordement] revoquer_jeton_raccordement :", error);
    return Response.json({ erreur: error.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
