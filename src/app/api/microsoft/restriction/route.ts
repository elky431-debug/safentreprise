/**
 * Étape 6 : la restriction, et sa vérification.
 *
 *   GET  ?tenant=<uid>   le script PowerShell prêt à coller
 *   POST ?tenant=<uid>   vérifie que la restriction fonctionne réellement
 *
 * ⚠ LA VÉRIFICATION NE CROIT PAS LE CLIENT SUR PAROLE, et elle ne se contente
 *   pas d'un échec. Elle procède par deux sondages :
 *
 *     • une boîte CHOISIE doit rester lisible — sinon le périmètre est faux et
 *       la surveillance ne fonctionnerait pas ;
 *     • une boîte NON choisie doit être REFUSÉE — c'est ce refus qui prouve
 *       la restriction.
 *
 *   Un simple échec ne suffit pas : un compte sans boîte aux lettres rend 404.
 *   Conclure d'un 404 que la restriction fonctionne serait une preuve fausse,
 *   et le produit prétendrait un cloisonnement qu'il n'a pas. Seul un refus
 *   explicite compte.
 */
import { listerBoites, sonderBoite, type Sondage } from "@/lib/microsoft/graph";
import { construireScript } from "@/lib/microsoft/restriction";
import { rpcService } from "@/lib/microsoft/consentement";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Locataire = { id: string; tenant_id: string };
type Choisie = { graph_user_id: string; upn: string; actif: boolean };

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

async function contexte(requete: Request): Promise<
  | { ok: true; locataire: Locataire; choisies: Choisie[]; societe: string }
  | { ok: false; statut: number; erreur: string }
> {
  const tenantUid = new URL(requete.url).searchParams.get("tenant");
  if (!tenantUid) {
    return { ok: false, statut: 400, erreur: "Paramètre « tenant » manquant." };
  }

  const supabase = await createClient();
  const { data: locataire } = await supabase
    .from("microsoft_tenants")
    .select("id, tenant_id")
    .eq("id", tenantUid)
    .maybeSingle();

  if (!locataire) {
    return {
      ok: false,
      statut: 404,
      erreur: "Locataire inconnu, ou n'appartenant pas à votre société.",
    };
  }

  const { data: choisies } = await supabase.rpc("boites_choisies_graph", {
    p_tenant_uid: tenantUid,
  });

  const liste = (choisies as Choisie[]) ?? [];
  if (liste.length === 0) {
    return {
      ok: false,
      statut: 409,
      erreur:
        "Aucune boîte sélectionnée. Choisissez d'abord les boîtes à surveiller.",
    };
  }

  const { data: societe } = await supabase
    .from("companies")
    .select("nom")
    .maybeSingle();

  return {
    ok: true,
    locataire: locataire as Locataire,
    choisies: liste,
    societe: (societe as { nom?: string } | null)?.nom ?? "Client",
  };
}

/* ==========================================================================
   GET — le script
   ========================================================================== */

export async function GET(requete: Request) {
  const ctx = await contexte(requete);
  if (!ctx.ok) {
    return Response.json({ erreur: ctx.erreur }, { status: ctx.statut });
  }

  const clientId = process.env.MS_CLIENT_ID?.trim();
  if (!clientId) {
    return Response.json(
      { erreur: "MS_CLIENT_ID absent de l'environnement." },
      { status: 500 },
    );
  }

  const { script, nomPerimetre, adresses, ignorees } = construireScript(
    clientId,
    ctx.choisies,
    ctx.societe,
  );

  return Response.json({
    script,
    perimetre: nomPerimetre,
    boites: adresses,
    // Une adresse écartée doit se voir : sinon le client croirait sa boîte
    // couverte alors qu'elle ne figure pas dans le filtre.
    adresses_ignorees: ignorees,
    a_savoir:
      "Le script vérifie lui-même que le rôle « Application Mail.ReadWrite » " +
      "existe sur votre locataire, et s'arrête en listant les rôles " +
      "disponibles s'il ne le trouve pas.",
  });
}

/* ==========================================================================
   POST — la vérification
   ========================================================================== */

type Resultat = {
  verifie: boolean;
  cause:
    | "restriction-active"
    | "script-non-execute"
    | "perimetre-trop-restrictif"
    | "aucun-temoin"
    | "indetermine";
  message: string;
  detail?: string;
};

/** Ce qu'on dit au client, selon ce que les deux sondages ont donné. */
function conclure(
  temoin: { upn: string; sondage: Sondage } | null,
  choisie: { upn: string; sondage: Sondage },
): Resultat {
  // 1. La boîte choisie doit rester lisible. Si elle ne l'est pas, inutile
  //    d'aller plus loin : la surveillance ne fonctionnerait pas.
  if (choisie.sondage.etat === "refuse") {
    return {
      verifie: false,
      cause: "perimetre-trop-restrictif",
      message:
        `Le script a bien restreint l'accès, mais TROP : la boîte ` +
        `${choisie.upn}, que vous avez choisie, est elle aussi refusée. ` +
        `Le périmètre ne contient pas les bonnes adresses. Vérifiez que le ` +
        `filtre reprend exactement les adresses principales des boîtes ` +
        `choisies, puis relancez la vérification.`,
      detail: choisie.sondage.message,
    };
  }

  if (choisie.sondage.etat !== "lisible") {
    return {
      verifie: false,
      cause: "indetermine",
      message:
        `La boîte ${choisie.upn} n'a pu être ni lue ni refusée franchement. ` +
        `Impossible de conclure. Si vous venez d'exécuter le script, ` +
        `attendez quelques minutes : Exchange met un moment à propager.`,
      detail: choisie.sondage.message,
    };
  }

  // 2. Sans témoin, on ne peut rien prouver. On le dit plutôt que de
  //    supposer que tout va bien.
  if (!temoin) {
    return {
      verifie: false,
      cause: "aucun-temoin",
      message:
        "Toutes les boîtes du locataire ont été sélectionnées : il n'en " +
        "reste aucune pour servir de témoin, et la restriction ne peut donc " +
        "pas être prouvée. Décochez temporairement une boîte, lancez la " +
        "vérification, puis recochez-la et relancez le script.",
    };
  }

  // 3. Le témoin. C'est lui qui porte la preuve.
  if (temoin.sondage.etat === "refuse") {
    return {
      verifie: true,
      cause: "restriction-active",
      message:
        `Restriction vérifiée. La boîte ${choisie.upn} reste lisible, et ` +
        `${temoin.upn}, qui n'est pas surveillée, est bien refusée par ` +
        `Microsoft. La surveillance peut démarrer.`,
      detail: `${temoin.upn} → ${temoin.sondage.code} : ${temoin.sondage.message}`,
    };
  }

  if (temoin.sondage.etat === "lisible") {
    return {
      verifie: false,
      cause: "script-non-execute",
      message:
        `La restriction n'est pas en place : Safentreprise peut encore lire ` +
        `${temoin.upn}, qui ne fait pas partie des boîtes surveillées. ` +
        `Le script PowerShell n'a pas été exécuté, ou pas jusqu'au bout. ` +
        `Faites-le exécuter par votre administrateur Exchange, puis relancez ` +
        `cette vérification.`,
    };
  }

  // 404 ou autre : le témoin n'a pas de boîte, ou Graph a répondu autre chose.
  // Ce n'est PAS un refus, et cela ne prouve rien.
  return {
    verifie: false,
    cause: "indetermine",
    message:
      `Le contrôle n'a pas pu conclure : la boîte témoin ${temoin.upn} n'a ` +
      `répondu ni « accessible » ni « refusée ». Elle n'a peut-être pas de ` +
      `boîte aux lettres. Relancez la vérification ; si cela persiste, ` +
      `transmettez le détail ci-dessous au support.`,
    detail: `${temoin.upn} → ${temoin.sondage.message}`,
  };
}

export async function POST(requete: Request) {
  const ctx = await contexte(requete);
  if (!ctx.ok) {
    return Response.json({ erreur: ctx.erreur }, { status: ctx.statut });
  }

  const choisiesIds = new Set(ctx.choisies.map((b) => b.graph_user_id));

  // Un témoin : une boîte du locataire que le client n'a PAS choisie.
  let temoin: { upn: string; graph_user_id: string } | null = null;
  try {
    const toutes = await listerBoites(ctx.locataire.tenant_id);
    const hors = toutes.find((b) => !choisiesIds.has(b.graph_user_id));
    temoin = hors ? { upn: hors.upn, graph_user_id: hors.graph_user_id } : null;
  } catch (erreur) {
    // Si l'annuaire est déjà refusé, c'est que la restriction porte aussi sur
    // User.Read.All — cas non prévu, qu'on ne maquille pas.
    return Response.json(
      {
        verifie: false,
        cause: "indetermine",
        message:
          "La liste des boîtes du locataire n'est plus lisible. Le script " +
          "a-t-il restreint plus que l'accès au courrier ?",
        detail: messageDe(erreur),
      },
      { status: 409 },
    );
  }

  const premiere = ctx.choisies[0]!;
  const resultat = conclure(
    temoin
      ? { upn: temoin.upn, sondage: await sonderBoite(ctx.locataire.tenant_id, temoin.graph_user_id) }
      : null,
    {
      upn: premiere.upn,
      sondage: await sonderBoite(ctx.locataire.tenant_id, premiere.graph_user_id),
    },
  );

  if (!resultat.verifie) {
    return Response.json(resultat, { status: 409 });
  }

  // ⚠ SEULEMENT MAINTENANT. marquer_restriction_verifiee est le seul endroit
  //   du schéma qui active une boîte, et elle n'est appelable qu'avec la clé
  //   de service — un client ne doit pas pouvoir la déclencher lui-même.
  try {
    const lignes = await rpcService<{ boites_activees: number; boites_verifiees: number }[]>(
      "marquer_restriction_verifiee",
      {
        p_tenant_uid: ctx.locataire.id,
        p_preuve: resultat.detail ?? resultat.message,
      },
    );
    const bilan = Array.isArray(lignes) ? lignes[0] : lignes;

    return Response.json({
      ...resultat,
      boites_activees: bilan?.boites_activees ?? 0,
      boites_verifiees: bilan?.boites_verifiees ?? 0,
      surveillance_active: true,
    });
  } catch (erreur) {
    console.error("[restriction] marquer_restriction_verifiee :", messageDe(erreur));
    return Response.json(
      {
        verifie: false,
        cause: "indetermine",
        message:
          "La restriction est bien en place, mais nous n'avons pas pu " +
          "l'enregistrer. Relancez la vérification.",
        detail: messageDe(erreur),
      },
      { status: 500 },
    );
  }
}
