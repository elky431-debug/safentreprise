/**
 * Étape 6 : la restriction, et sa vérification.
 *
 *   GET  ?tenant=<uid>   le script PowerShell prêt à coller
 *   POST ?tenant=<uid>   vérifie que la restriction fonctionne réellement
 *        corps facultatif : { "temoin_upn": "salle-reunion@client.fr" }
 *
 * ⚠ LA VÉRIFICATION NE CROIT PAS LE CLIENT SUR PAROLE, et elle ne se contente
 *   pas d'un échec. Elle procède par deux sondages :
 *
 *     • une boîte CHOISIE doit rester lisible — sinon le périmètre est faux et
 *       la surveillance ne fonctionnerait pas ;
 *     • une boîte NON choisie — le TÉMOIN — doit être REFUSÉE. C'est ce refus
 *       qui prouve la restriction.
 *
 *   Un simple échec ne suffit pas : un compte sans boîte aux lettres rend 404.
 *   Conclure d'un 404 que la restriction fonctionne serait une preuve fausse,
 *   et le produit prétendrait un cloisonnement qu'il n'a pas. Seul un refus
 *   explicite compte. C'est pourquoi on sonde PLUSIEURS témoins possibles
 *   jusqu'à en obtenir un qui réponde franchement.
 */
import {
  listerBoites,
  obtenirServicePrincipal,
  sonderBoite,
  type BoiteCandidate,
  type Sondage,
} from "@/lib/microsoft/graph";
import {
  adresseTemoin,
  candidatsTemoin,
  commandeCreationTemoin,
  construireScript,
  type EtatTemoin,
} from "@/lib/microsoft/restriction";
import { rpcService } from "@/lib/microsoft/consentement";
import { createClient } from "@/lib/supabase/server";
import { avecContexteJournal } from "@/lib/microsoft/journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Au-delà, on ne sonde plus : la requête doit rendre la main. */
const SONDAGES_MAX = 5;

type Locataire = {
  id: string;
  tenant_id: string;
  temoin_graph_user_id: string | null;
  temoin_upn: string | null;
  /** ObjectId de notre service principal chez le client. Voir sp_object_id. */
  sp_object_id: string | null;
};
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
    .select(
      "id, tenant_id, temoin_graph_user_id, temoin_upn, sp_object_id",
    )
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
   Le témoin : le chercher avant de le créer
   ========================================================================== */

/** Le domaine sur lequel une boîte témoin serait créée. */
function domaineDe(choisies: Choisie[]): string | null {
  const domaine = choisies[0]?.upn.split("@")[1]?.trim().toLowerCase();
  return domaine || null;
}

/* ==========================================================================
   GET — le script
   ========================================================================== */

async function getInterne(requete: Request) {
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

  // L'ObjectId du service principal. Il est normalement inscrit au moment du
  // consentement ; on le rattrape ici pour les locataires raccordés avant que
  // ce soit fait, et si l'appel avait échoué ce jour-là.
  //
  // ⚠ ON NE PRODUIT PAS DE SCRIPT SANS LUI. Sans cet identifiant, la commande
  //   New-ServicePrincipal du script échouerait chez le client, après qu'il a
  //   mobilisé son administrateur. Autant le dire ici.
  let spObjectId = ctx.locataire.sp_object_id?.trim() || null;
  if (!spObjectId) {
    try {
      const sp = await obtenirServicePrincipal(ctx.locataire.tenant_id);
      spObjectId = sp.objectId;
      await rpcService("enregistrer_sp_graph", {
        p_tenant_uid: ctx.locataire.id,
        p_sp_object_id: spObjectId,
      });
    } catch (erreur) {
      console.error("[restriction] service principal :", messageDe(erreur));
      return Response.json(
        {
          erreur:
            "Safentreprise n'a pas pu retrouver son identifiant d'application " +
            "dans votre annuaire Microsoft. Le script ne peut pas être produit " +
            "sans lui. L'autorisation administrateur est-elle toujours en " +
            "place ? Relancez le raccordement, ou transmettez le détail " +
            "ci-dessous au support.",
          detail: messageDe(erreur),
        },
        { status: 409 },
      );
    }
  }

  // On regarde l'annuaire AVANT d'écrire le script : s'il reste déjà une boîte
  // hors périmètre, le script n'a aucune boîte à créer chez le client.
  const choisiesIds = new Set(ctx.choisies.map((b) => b.graph_user_id));
  let etat: EtatTemoin;
  let annuaireLu = true;
  try {
    const candidats = candidatsTemoin(
      await listerBoites(ctx.locataire.tenant_id),
      choisiesIds,
      ctx.locataire.temoin_graph_user_id,
    );
    etat = candidats[0]
      ? { etat: "existant", upn: candidats[0].upn }
      : { etat: "aucun" };
  } catch (erreur) {
    // On ne fait pas créer une boîte dans le locataire du client parce qu'on
    // n'a pas su lire son annuaire.
    console.error("[restriction] annuaire illisible :", messageDe(erreur));
    etat = { etat: "inconnu" };
    annuaireLu = false;
  }

  const { script, nomPerimetre, adresses, ignorees, temoinACreer } =
    construireScript(
      clientId,
      spObjectId,
      ctx.choisies,
      ctx.societe,
      etat,
      domaineDe(ctx.choisies),
    );

  return Response.json({
    script,
    perimetre: nomPerimetre,
    boites: adresses,
    // Une adresse écartée doit se voir : sinon le client croirait sa boîte
    // couverte alors qu'elle ne figure pas dans le filtre.
    adresses_ignorees: ignorees,
    temoin_existant: etat.etat === "existant" ? etat.upn : null,
    temoin_a_creer: temoinACreer,
    annuaire_lu: annuaireLu,
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
    | "acces-non-restreint"
    | "perimetre-trop-restrictif"
    | "aucun-temoin"
    | "indetermine";
  message: string;
  detail?: string;
  /** Les deux sorties possibles quand il n'y a pas de témoin. */
  issues?: { titre: string; explication: string; commande?: string }[];
};

/** Ce qu'on dit au client, selon ce que les deux sondages ont donné. */
function conclure(
  temoin: { upn: string; sondage: Sondage } | null,
  choisie: { upn: string; sondage: Sondage },
  domaine: string | null,
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

  // 2. Sans témoin, on ne peut rien prouver. On le dit, et on donne les deux
  //    sorties — le parcours ne s'arrête pas net.
  if (!temoin) {
    return {
      verifie: false,
      cause: "aucun-temoin",
      message:
        "La restriction est peut-être en place, mais rien ne permet de le " +
        "prouver : il ne reste aucune boîte hors surveillance que Microsoft " +
        "puisse nous refuser. Tant que cette preuve manque, l'analyse ne " +
        "démarre pas. Deux façons d'en sortir, au choix.",
      issues: [
        {
          titre: "Créer la boîte de contrôle à la main",
          explication:
            "Une boîte partagée, vide, jamais surveillée. Le script a " +
            "essayé de la créer et n'y est pas parvenu — le message d'erreur " +
            "est resté dans sa fenêtre PowerShell. Relancez la commande " +
            "ci-dessous dans la même session, puis revenez lancer la " +
            "vérification.",
          commande: domaine
            ? commandeCreationTemoin(adresseTemoin(domaine))
            : undefined,
        },
        {
          titre: "Laisser une boîte existante hors surveillance",
          explication:
            "Retirez une boîte de votre sélection — une boîte partagée ou " +
            "une salle de réunion fait très bien l'affaire — puis relancez " +
            "le script et la vérification. Cette boîte ne sera pas analysée : " +
            "c'est un vrai choix, pas une manipulation provisoire.",
        },
      ],
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
    // ⚠ NE PAS ACCUSER LE CLIENT DE NE PAS AVOIR EXÉCUTÉ LE SCRIPT. Ce message
    //   disait exactement cela, et il s'est trompé sur un locataire réel où le
    //   script AVAIT été exécuté et où Test-ServicePrincipalAuthorization
    //   rendait bien InScope False sur le témoin.
    //
    //   La cause était ailleurs, et elle est documentée par Microsoft : les
    //   autorisations d'Exchange RBAC s'AJOUTENT à celles d'Entra ID — c'est
    //   une union, pas une restriction. Tant que Mail.ReadWrite reste accordée
    //   à l'échelle du locataire dans Entra, elle autorise la lecture quel que
    //   soit le périmètre Exchange. Voir docs/RESTRICTION-UNION-ENTRA.md.
    //
    //   Un message qui affirme une cause qu'il n'a pas constatée envoie
    //   chercher au mauvais endroit. On décrit donc ce qu'on a observé, et on
    //   nomme les deux causes possibles avec le contrôle qui les départage.
    return {
      verifie: false,
      cause: "acces-non-restreint",
      message:
        `L'accès n'est pas restreint : Safentreprise a pu lire un message de ` +
        `${temoin.upn}, qui ne fait pas partie des boîtes surveillées. ` +
        `La surveillance ne peut pas démarrer tant que c'est le cas. Trois ` +
        `causes possibles, à vérifier dans cet ordre.`,
      issues: [
        {
          // ⚠ EN PREMIER PARCE QUE C'EST LE CAS LE PLUS FRÉQUENT, et le seul
          //   qui se règle en ne faisant rien. Constaté à l'essai réel : la
          //   vérification lancée dans la foulée du script a conclu « accès non
          //   restreint », puis la même vérification a réussi une heure plus
          //   tard, sans que rien n'ait été modifié entre-temps.
          //
          //   Microsoft ne révoque pas les autorisations déjà délivrées : elles
          //   valent jusqu'à expiration. Un administrateur qui enchaîne script
          //   et vérification tombera systématiquement dessus.
          titre: "L'autorisation précédente n'a pas encore expiré",
          explication:
            "Microsoft ne retire pas immédiatement une autorisation déjà " +
            "accordée : elle reste valable environ une heure, même après la " +
            "mise en place de la restriction. Si le script vient d'être " +
            "exécuté, c'est l'explication la plus probable, et il n'y a rien " +
            "à corriger. Attendez une heure, puis relancez la vérification.",
        },
        {
          titre: "Le script n'a pas été exécuté jusqu'au bout",
          explication:
            "Votre administrateur peut le vérifier avec la commande " +
            "ci-dessous : elle doit répondre InScope False sur la boîte de " +
            "contrôle, et True sur une boîte surveillée. Si elle répond " +
            "autrement, le script est à relancer.",
          commande: `Test-ServicePrincipalAuthorization -Identity 'Safentreprise' -Resource '${temoin.upn}'`,
        },
        {
          titre:
            "Une autorisation à l'échelle du locataire subsiste dans votre annuaire",
          explication:
            "Elle ne se voit pas depuis Exchange. Les autorisations accordées " +
            "dans Entra ID et celles d'Exchange s'additionnent : tant qu'une " +
            "autorisation de lecture du courrier reste accordée à l'ensemble " +
            "de l'organisation, elle autorise la lecture quel que soit le " +
            "périmètre Exchange — le contrôle Exchange peut donc dire « hors " +
            "périmètre » pendant que la lecture réussit. Ne concerne que les " +
            "raccordements les plus anciens. Contactez le support " +
            "Safentreprise : c'est un réglage de notre application, pas du " +
            "vôtre.",
        },
      ],
      detail:
        `Lecture réussie sur ${temoin.upn} — la boîte n'aurait pas dû être ` +
        `accessible.`,
    };
  }

  // 404 ou autre sur TOUS les témoins essayés : ce n'est PAS un refus, et cela
  // ne prouve rien.
  return {
    verifie: false,
    cause: "indetermine",
    message:
      `Le contrôle n'a pas pu conclure : aucune des boîtes essayées comme ` +
      `témoin, dont ${temoin.upn}, n'a répondu ni « accessible » ni ` +
      `« refusée ». Ce sont peut-être des comptes sans boîte aux lettres. ` +
      `Relancez la vérification ; si cela persiste, transmettez le détail ` +
      `ci-dessous au support.`,
    detail: `${temoin.upn} → ${temoin.sondage.message}`,
  };
}

async function postInterne(requete: Request) {
  const ctx = await contexte(requete);
  if (!ctx.ok) {
    return Response.json({ erreur: ctx.erreur }, { status: ctx.statut });
  }

  // Le client peut désigner lui-même la boîte à laisser hors surveillance.
  let designee: string | null = null;
  try {
    const corps = (await requete.json()) as { temoin_upn?: unknown };
    if (typeof corps?.temoin_upn === "string" && corps.temoin_upn.trim()) {
      designee = corps.temoin_upn.trim().toLowerCase();
    }
  } catch {
    // Pas de corps : c'est le cas courant.
  }

  const choisiesIds = new Set(ctx.choisies.map((b) => b.graph_user_id));

  let candidats: BoiteCandidate[];
  try {
    candidats = candidatsTemoin(
      await listerBoites(ctx.locataire.tenant_id),
      choisiesIds,
      ctx.locataire.temoin_graph_user_id,
    );
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

  if (designee) {
    const voulue = candidats.find((b) => b.upn === designee);
    if (!voulue) {
      return Response.json(
        {
          verifie: false,
          cause: "aucun-temoin",
          message:
            `La boîte ${designee} ne peut pas servir de témoin : elle est ` +
            `surveillée, ou elle n'existe pas dans votre annuaire. Retirez-la ` +
            `d'abord de votre sélection, ou choisissez-en une autre.`,
        },
        { status: 409 },
      );
    }
    candidats = [voulue];
  }

  const premiere = ctx.choisies[0]!;
  const surChoisie = await sonderBoite(
    ctx.locataire.tenant_id,
    premiere.graph_user_id,
  );

  // ⚠ ON ESSAIE PLUSIEURS TÉMOINS. Un 404 ne prouve rien — c'est un compte
  //   sans boîte aux lettres, pas un refus. S'arrêter au premier candidat
  //   introuvable ferait échouer la vérification chez tout client qui a un
  //   compte de service dans son annuaire.
  let retenu: { boite: BoiteCandidate; sondage: Sondage } | null = null;
  for (const candidat of candidats.slice(0, SONDAGES_MAX)) {
    const sondage = await sonderBoite(
      ctx.locataire.tenant_id,
      candidat.graph_user_id,
    );
    retenu = { boite: candidat, sondage };
    if (sondage.etat === "refuse" || sondage.etat === "lisible") break;
  }

  const resultat = conclure(
    retenu ? { upn: retenu.boite.upn, sondage: retenu.sondage } : null,
    { upn: premiere.upn, sondage: surChoisie },
    domaineDe(ctx.choisies),
  );

  if (!resultat.verifie) {
    return Response.json(resultat, { status: 409 });
  }

  // Le témoin qui a porté la preuve est enregistré : c'est lui qu'on
  // resondera, et le schéma interdira désormais de le mettre sous
  // surveillance. Sans cet enregistrement, la vue tenants_en_alerte
  // signalerait à juste titre un locataire vérifié sans témoin.
  const preuve = retenu!.boite;
  const domaine = domaineDe(ctx.choisies);
  // « cree » : c'est la boîte que notre script a fabriquée, reconnaissable à
  // son adresse. Toute autre existait avant nous, et on ne s'en attribue pas
  // le mérite — l'origine sert à savoir ce qu'on pourrait avoir à nettoyer si
  // le client résilie.
  const origine =
    domaine && preuve.upn === adresseTemoin(domaine) ? "cree" : "existant";

  try {
    await rpcService("retenir_temoin_graph", {
      p_tenant_uid: ctx.locataire.id,
      p_graph_user_id: preuve.graph_user_id,
      p_upn: preuve.upn,
      p_origine: origine,
    });
  } catch (erreur) {
    console.error("[restriction] retenir_temoin_graph :", messageDe(erreur));
    return Response.json(
      {
        verifie: false,
        cause: "indetermine",
        message:
          "La restriction est bien en place, mais nous n'avons pas pu " +
          "enregistrer la boîte qui l'a prouvée. Relancez la vérification.",
        detail: messageDe(erreur),
      },
      { status: 500 },
    );
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
      temoin: preuve.upn,
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

/**
 * Tout accès déclenché par cette route est attribué à « raccordement ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function GET(requete: Request) {
  return avecContexteJournal(
    { acteur: "raccordement", tache: "script-restriction" },
    () => getInterne(requete),
  );
}

/**
 * Tout accès déclenché par cette route est attribué à « raccordement ».
 * Le contexte suit l'exécution (AsyncLocalStorage) : deux requêtes
 * simultanées ne peuvent pas se voler leur acteur.
 */
export async function POST(requete: Request) {
  return avecContexteJournal(
    { acteur: "raccordement", tache: "verification-restriction" },
    () => postInterne(requete),
  );
}
