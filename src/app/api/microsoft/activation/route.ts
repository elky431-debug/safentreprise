/**
 * Étape 7, la dernière : la surveillance démarre.
 *
 *   POST ?tenant=<uid>   abonne les boîtes vérifiées, amorce l'annuaire
 *   GET  ?tenant=<uid>   où en est le raccordement, sans rien modifier
 *
 * ⚠ N'ABONNE QUE DES BOÎTES DÉJÀ VÉRIFIÉES. boites_a_abonner() ne rend que les
 *   boîtes actives dont la restriction a été constatée. Une boîte choisie mais
 *   non vérifiée n'est pas abonnée — donc Microsoft ne notifie rien à son
 *   sujet, et rien n'est analysé. C'est la même règle qu'ailleurs, appliquée
 *   au dernier maillon.
 *
 * Les deux travaux sont indépendants : un annuaire qui échoue ne doit pas
 * priver le client de sa surveillance, et inversement.
 */
import {
  ErreurGraph,
  creerAbonnement,
  domainesDeAnnuaire,
  listerAnnuaire,
} from "@/lib/microsoft/graph";
import { rpcService } from "@/lib/microsoft/consentement";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sous le plafond Outlook de 10 080 minutes, pour absorber le décalage. */
const DUREE_MINUTES = 9600;
const CHEMIN_WEBHOOK = "/api/microsoft/webhook";

type ABonner = {
  boite_id: string;
  tenant_id: string;
  graph_user_id: string;
  upn: string;
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * L'adresse que Microsoft appellera. Même cascade que la maintenance, pour la
 * même raison : une variable oubliée ne doit pas arrêter un raccordement.
 */
function urlWebhook(requete: Request): string | null {
  const candidates = [
    process.env.GRAPH_NOTIFICATION_URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.URL,
    (() => {
      const hote =
        requete.headers.get("x-forwarded-host") ?? requete.headers.get("host");
      return hote ? `https://${hote}` : null;
    })(),
  ];

  for (const brute of candidates) {
    if (!brute?.trim()) continue;
    try {
      const u = new URL(brute.trim());
      if (u.protocol !== "https:") continue;
      if (/^(localhost|127\.|\[?::1\]?)/i.test(u.hostname)) continue;
      const chemin = u.pathname.replace(/\/+$/, "");
      return `${u.origin}${chemin === "" ? CHEMIN_WEBHOOK : chemin}`;
    } catch {
      continue;
    }
  }
  return null;
}

/** Le locataire, si la session y a droit. La RLS fait le cloisonnement. */
async function locataire(requete: Request) {
  const tenantUid = new URL(requete.url).searchParams.get("tenant");
  if (!tenantUid) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("microsoft_tenants")
    .select("id, tenant_id, restriction_verifiee_at")
    .eq("id", tenantUid)
    .maybeSingle();
  return (data as {
    id: string;
    tenant_id: string;
    restriction_verifiee_at: string | null;
  } | null) ?? null;
}

/* ==========================================================================
   GET — où en est-on ?
   ========================================================================== */

export async function GET(requete: Request) {
  const t = await locataire(requete);
  if (!t) {
    return Response.json({ erreur: "Locataire inconnu." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: boites } = await supabase.rpc("boites_choisies_graph", {
    p_tenant_uid: t.id,
  });
  const liste = (boites as { upn: string; actif: boolean }[]) ?? [];

  return Response.json({
    tenant_uid: t.id,
    restriction_verifiee: t.restriction_verifiee_at !== null,
    boites_choisies: liste.length,
    boites_actives: liste.filter((b) => b.actif).length,
    pret_a_activer: t.restriction_verifiee_at !== null && liste.some((b) => b.actif),
  });
}

/* ==========================================================================
   POST — abonner, puis amorcer l'annuaire
   ========================================================================== */

export async function POST(requete: Request) {
  const t = await locataire(requete);
  if (!t) {
    return Response.json({ erreur: "Locataire inconnu." }, { status: 404 });
  }

  // Garde-fou explicite, en plus de celui de boites_a_abonner. Le message
  // compte : le client doit savoir quelle étape il a sautée.
  if (!t.restriction_verifiee_at) {
    return Response.json(
      {
        erreur:
          "La restriction d'accès n'a pas été vérifiée. Tant qu'elle ne l'est " +
          "pas, aucune boîte n'est surveillée et rien ne peut être abonné.",
        etape_manquante: "restriction",
      },
      { status: 409 },
    );
  }

  const url = urlWebhook(requete);
  if (!url) {
    return Response.json(
      {
        erreur:
          "Aucune adresse de notification utilisable : ni GRAPH_NOTIFICATION_URL, " +
          "ni adresse de déploiement, ni en-tête d'hôte exploitable en HTTPS.",
      },
      { status: 500 },
    );
  }

  /* --- Abonnements ------------------------------------------------------- */

  const abonnements = { crees: 0, echecs: 0, details: [] as unknown[] };

  try {
    const aBonner =
      (await rpcService<ABonner[]>("boites_a_abonner", {
        p_tenant_uid: t.id,
        p_limite: 50,
      })) ?? [];

    const expiration = new Date(Date.now() + DUREE_MINUTES * 60_000).toISOString();

    for (const boite of aBonner) {
      try {
        const cree = await creerAbonnement(
          boite.tenant_id,
          boite.graph_user_id,
          url,
          expiration,
        );

        await rpcService("enregistrer_abonnement_graph", {
          p_boite_id: boite.boite_id,
          p_subscription_id: cree.id,
          p_resource: `/users/${boite.graph_user_id}/mailFolders('inbox')/messages`,
          // Le secret partagé du NOUVEL abonnement. Garder l'ancien ferait
          // refuser toutes les notifications, en silence.
          p_client_state: cree.clientState,
          p_expire_at: cree.expirationDateTime,
          p_notification_url: cree.notificationUrl ?? url,
        });

        abonnements.crees += 1;
        abonnements.details.push({ upn: boite.upn, etat: "abonnee" });
      } catch (erreur) {
        const graph = erreur instanceof ErreurGraph ? erreur : null;
        abonnements.echecs += 1;
        abonnements.details.push({
          upn: boite.upn,
          etat: "echec",
          // Un 403 ici veut dire que la restriction exclut cette boîte : le
          // périmètre et la sélection ne concordent pas.
          erreur:
            graph?.statut === 403
              ? `Microsoft refuse l'abonnement à cette boîte. Elle ne fait ` +
                `probablement pas partie du périmètre de restriction.`
              : messageDe(erreur),
        });
      }
    }
  } catch (erreur) {
    abonnements.details.push({ etat: "echec-global", erreur: messageDe(erreur) });
  }

  /* --- Annuaire ---------------------------------------------------------- */

  // Indépendant : un annuaire qui échoue ne prive pas le client de sa
  // surveillance. Il dégrade la détection d'usurpation, ce qui est moins grave
  // que de ne rien analyser du tout.
  const annuaire: Record<string, unknown> = {};
  try {
    const personnes = await listerAnnuaire(t.tenant_id);
    if (personnes.length === 0) {
      annuaire.etat = "vide";
      annuaire.note =
        "Aucune personne lue : l'annuaire n'a pas été remplacé, pour ne pas " +
        "effacer l'existant sur un appel raté.";
    } else {
      const bilan = await rpcService<{ personnes: number; domaines: number }[]>(
        "rafraichir_annuaire_graph",
        {
          p_tenant_uid: t.id,
          p_personnes: personnes,
          p_domaines: domainesDeAnnuaire(personnes),
        },
      );
      const r = Array.isArray(bilan) ? bilan[0] : bilan;
      annuaire.etat = "rafraichi";
      annuaire.personnes = r?.personnes ?? personnes.length;
      annuaire.domaines = r?.domaines ?? 0;
    }
  } catch (erreur) {
    annuaire.etat = "echec";
    annuaire.erreur = messageDe(erreur);
    console.error("[activation] annuaire :", messageDe(erreur));
  }

  const enMarche = abonnements.crees > 0 && abonnements.echecs === 0;

  return Response.json(
    {
      surveillance_active: enMarche,
      abonnements,
      annuaire,
      adresse_notification: url,
      message: enMarche
        ? "La surveillance est en place. Les prochains messages reçus dans les " +
          "boîtes choisies seront analysés."
        : abonnements.crees > 0
          ? "Une partie des boîtes est surveillée ; les autres ont échoué. " +
            "Voir le détail."
          : "Aucun abonnement créé. Si toutes les boîtes en avaient déjà un, " +
            "la surveillance était déjà en place.",
    },
    { status: abonnements.echecs > 0 ? 207 : 200 },
  );
}
