/** L'état du raccordement, lu depuis un jeton. Sans session. */
import { etatDuJeton, jetonPropre } from "@/lib/raccordement/jeton-serveur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(requete: Request) {
  const jeton = jetonPropre(new URL(requete.url).searchParams.get("jeton"));
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  const etat = await etatDuJeton(jeton);
  // ⚠ 404 ET PAS 500 : un jeton expiré n'est pas une panne de notre côté.
  if (!etat) return Response.json({ erreur: "jeton invalide" }, { status: 404 });

  return Response.json(etat, {
    headers: { "Cache-Control": "no-store" },
  });
}
