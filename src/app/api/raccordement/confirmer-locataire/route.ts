/** Le dirigeant reconnaît le locataire Microsoft comme étant le sien. */
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirmer_locataire_dirigeant");

  if (error) {
    console.error("[raccordement] confirmer_locataire_dirigeant :", error);
    return Response.json({ erreur: error.message }, { status: 400 });
  }
  // `false` = déjà confirmé. Ce n'est pas une erreur.
  return Response.json({ ok: true, deja_confirme: data === false });
}
