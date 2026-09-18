/**
 * Referme le lien une fois le raccordement abouti.
 *
 * ⚠ LE JETON MEURT QUAND LE TRAVAIL EST FINI, PAS À SON EXPIRATION. Le laisser
 *   ouvert quatorze jours après coup permettrait à n'importe quel détenteur de
 *   relancer un consentement ou de changer le périmètre sans que le dirigeant
 *   le voie passer.
 */
import { jetonPropre } from "@/lib/raccordement/jeton-serveur";
import { rpcService } from "@/lib/microsoft/consentement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(requete: Request) {
  let corps: { jeton?: unknown };
  try {
    corps = (await requete.json()) as { jeton?: unknown };
  } catch {
    return Response.json({ erreur: "corps illisible" }, { status: 400 });
  }

  const jeton = jetonPropre(corps.jeton);
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  try {
    const clos = await rpcService<boolean>("clore_jeton_raccordement", {
      p_jeton: jeton,
    });
    // ⚠ `false` N'EST PAS UNE ERREUR : le jeton était déjà clos, parce que la
    //   vérification a abouti deux fois — un rechargement, un double clic. La
    //   première date est gardée, et c'est la bonne.
    return Response.json({ ok: true, deja_clos: clos === false });
  } catch (erreur) {
    console.error("[raccordement] clore_jeton_raccordement :", erreur);
    return Response.json({ erreur: "clôture impossible" }, { status: 500 });
  }
}
