/** L'annuaire du locataire, pour résoudre les adresses nommées. */
import { jetonPropre, locataireDuJeton } from "@/lib/raccordement/jeton-serveur";
import { listerBoites } from "@/lib/microsoft/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(requete: Request) {
  const jeton = jetonPropre(new URL(requete.url).searchParams.get("jeton"));
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  // ⚠ LE LOCATAIRE VIENT DE LA BASE, JAMAIS DE LA REQUÊTE. Accepter un
  //   `tenant_id` en paramètre laisserait n'importe qui faire appeler Graph
  //   sur le locataire de son choix avec NOS autorisations.
  const tenantId = await locataireDuJeton(jeton);
  if (!tenantId) {
    return Response.json(
      { erreur: "jeton invalide, ou accord Microsoft pas encore donné" },
      { status: 404 },
    );
  }

  try {
    return Response.json(await listerBoites(tenantId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (erreur) {
    // ⚠ LE CAS FRÉQUENT N'EST PAS UNE PANNE : l'accord vient d'être donné et
    //   Microsoft ne l'a pas encore propagé. L'écran le dit et propose de
    //   réessayer plutôt que d'annoncer une erreur.
    console.error("[raccordement] listerBoites :", erreur);
    return Response.json(
      { erreur: erreur instanceof Error ? erreur.message : "annuaire illisible" },
      { status: 502 },
    );
  }
}
