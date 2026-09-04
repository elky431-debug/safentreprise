/**
 * Étape 5 du raccordement : le client choisit les boîtes à surveiller.
 *
 *   GET  ?tenant=<uid>   la liste des boîtes du locataire, et celles déjà cochées
 *   POST ?tenant=<uid>   enregistre la sélection
 *
 * Les boîtes enregistrées sont INACTIVES. Elles ne s'activeront qu'à l'étape 6,
 * quand la restriction aura été constatée — voir /api/microsoft/restriction.
 */
import { ErreurGraph, listerBoites } from "@/lib/microsoft/graph";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Locataire = { id: string; tenant_id: string };
type Choisie = { graph_user_id: string; upn: string; actif: boolean };

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Le locataire, à condition qu'il appartienne bien à la société de la session.
 *
 * La lecture passe par le client Supabase de l'utilisateur : la politique RLS
 * de microsoft_tenants fait le cloisonnement. Un identifiant de locataire
 * appartenant à une autre société ne renvoie simplement rien.
 */
async function locataireDeLaSession(
  tenantUid: string | null,
): Promise<Locataire | null> {
  if (!tenantUid) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("microsoft_tenants")
    .select("id, tenant_id")
    .eq("id", tenantUid)
    .maybeSingle();
  return (data as Locataire | null) ?? null;
}

/**
 * Lister les boîtes, en tenant compte de la réplication.
 *
 * Juste après l'accord administrateur, le service principal peut ne pas encore
 * exister dans le locataire : Graph répond alors une erreur d'application
 * inconnue. Quelques secondes suffisent. Conclure à l'échec du premier coup
 * ferait échouer un raccordement parfaitement valide, au pire moment — celui
 * où le client vient de donner son accord.
 */
async function listerAvecReprises(tenantId: string) {
  const attentes = [0, 2000, 4000, 6000];
  let derniere: unknown = null;

  for (const attente of attentes) {
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    try {
      return { ok: true as const, boites: await listerBoites(tenantId) };
    } catch (erreur) {
      derniere = erreur;
      // Un secret d'application invalide ne s'arrangera pas en patientant.
      if (erreur instanceof ErreurGraph && erreur.code === "invalid_client") break;
      // Une permission manquante non plus : c'est un problème de configuration.
      if (erreur instanceof ErreurGraph && erreur.statut === 403) break;
    }
  }

  return { ok: false as const, erreur: messageDe(derniere) };
}

export async function GET(requete: Request) {
  const tenantUid = new URL(requete.url).searchParams.get("tenant");
  const locataire = await locataireDeLaSession(tenantUid);
  if (!locataire) {
    return Response.json(
      { erreur: "Locataire inconnu, ou n'appartenant pas à votre société." },
      { status: 404 },
    );
  }

  const resultat = await listerAvecReprises(locataire.tenant_id);
  if (!resultat.ok) {
    return Response.json(
      {
        erreur:
          "Microsoft n'a pas encore rendu la liste des boîtes. Si vous venez " +
          "d'accorder l'autorisation, patientez une minute et réessayez.",
        detail: resultat.erreur,
      },
      { status: 503 },
    );
  }

  // Ce qui est déjà coché, pour que l'écran reparte de l'existant plutôt que
  // d'une page blanche.
  let deja: Choisie[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("boites_choisies_graph", {
      p_tenant_uid: locataire.id,
    });
    deja = (data as Choisie[]) ?? [];
  } catch {
    deja = [];
  }

  const cochees = new Set(deja.map((b) => b.graph_user_id));

  return Response.json({
    tenant_uid: locataire.id,
    boites: resultat.boites.map((b) => ({ ...b, choisie: cochees.has(b.graph_user_id) })),
    total: resultat.boites.length,
  });
}

export async function POST(requete: Request) {
  const tenantUid = new URL(requete.url).searchParams.get("tenant");
  const locataire = await locataireDeLaSession(tenantUid);
  if (!locataire) {
    return Response.json(
      { erreur: "Locataire inconnu, ou n'appartenant pas à votre société." },
      { status: 404 },
    );
  }

  let corps: { boites?: { graph_user_id?: string; upn?: string }[] };
  try {
    corps = (await requete.json()) as typeof corps;
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const boites = (corps.boites ?? []).filter((b) => b?.graph_user_id && b?.upn);
  if (boites.length === 0) {
    return Response.json(
      { erreur: "Sélectionnez au moins une boîte à surveiller." },
      { status: 400 },
    );
  }

  // La RPC tourne avec la session du client : elle revérifie elle-même que le
  // locataire lui appartient, et désactive ce qui n'est plus coché.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("choisir_boites_graph", {
    p_tenant_uid: locataire.id,
    p_boites: boites,
  });

  if (error) {
    console.error("[boites] choisir_boites_graph :", error);
    return Response.json(
      { erreur: `Enregistrement refusé : ${error.message}` },
      { status: 500 },
    );
  }

  const resume = (Array.isArray(data) ? data[0] : data) as
    | { retenues: number; retirees: number }
    | undefined;

  // ⚠ On ne laisse pas croire que la surveillance démarre. Le choix des boîtes
  //   ne suffit pas : la restriction doit être constatée.
  return Response.json({
    retenues: resume?.retenues ?? boites.length,
    retirees: resume?.retirees ?? 0,
    surveillance_active: false,
    etape_suivante:
      "Les boîtes sont enregistrées mais INACTIVES. Aucun message n'est " +
      "analysé tant que la restriction d'accès n'a pas été mise en place et " +
      "vérifiée : GET /api/microsoft/restriction?tenant=" + locataire.id,
  });
}
