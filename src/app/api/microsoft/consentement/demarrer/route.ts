/**
 * Étape 1-2 du raccordement : envoyer le client chez Microsoft.
 *
 * On remet au client un jeton d'état à usage unique, valable quinze minutes,
 * et on le redirige vers l'écran d'accord administrateur de Microsoft.
 *
 *   GET  → redirige directement (pratique pour un lien, et pour essayer)
 *   POST → renvoie l'adresse en JSON (pour un bouton dans l'interface)
 *
 * ⚠ LA SOCIÉTÉ N'EST PAS UN PARAMÈTRE. demarrer_consentement_graph la lit de
 *   la session. La laisser choisir permettrait de rattacher le locataire
 *   Microsoft d'une entreprise à la société d'une autre.
 */
import { createClient } from "@/lib/supabase/server";
import {
  adresseAppelante,
  configurationConsentement,
  urlConsentement,
} from "@/lib/microsoft/consentement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Depart = { etat: string; expire_at: string };

async function preparer(
  requete: Request,
): Promise<
  | { ok: true; url: string; expire_at: string }
  | { ok: false; statut: number; erreur: string }
> {
  const config = configurationConsentement();
  if (!config.ok) {
    // Une configuration absente est un problème d'exploitation, pas la faute
    // du client : on le dit clairement plutôt que de partir chez Microsoft
    // pour s'y faire rejeter.
    console.error("[consentement] configuration :", config.erreur);
    return { ok: false, statut: 500, erreur: config.erreur };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getUser();
  const utilisateur = session?.user;

  if (!utilisateur) {
    return {
      ok: false,
      statut: 401,
      erreur: "Connectez-vous avant de raccorder Microsoft 365.",
    };
  }

  // La RPC tourne avec la session du client : get_my_company_id() y résout
  // sa société. C'est le seul rattachement possible.
  const { data, error } = await supabase.rpc("demarrer_consentement_graph", {
    p_email: utilisateur.email ?? null,
    p_ip: adresseAppelante(requete),
  });

  if (error) {
    console.error("[consentement] demarrer_consentement_graph :", error);

    // ⚠ NE PAS DEVINER LA CAUSE. La première version de cette route renvoyait
    //   « votre compte est-il rattaché à une société ? » pour n'importe quelle
    //   erreur. L'échec réel était tout autre — une fonction Postgres
    //   introuvable — et le message a envoyé chercher au mauvais endroit.
    //
    //   On distingue donc le seul cas qu'on sait reconnaître, et on rend le
    //   message de Postgres pour tous les autres.
    const brut = `${error.message ?? ""} ${error.details ?? ""}`.trim();
    const sansSociete = /Aucune soci[ée]t[ée] pour cette session/i.test(brut);

    return {
      ok: false,
      statut: sansSociete ? 409 : 500,
      erreur: sansSociete
        ? "Votre compte n'est rattaché à aucune société. Contactez le support."
        : `Le raccordement n'a pas pu être préparé. Erreur renvoyée par la ` +
          `base : ${brut || "sans détail"}`,
    };
  }

  const depart = (Array.isArray(data) ? data[0] : data) as Depart | undefined;
  if (!depart?.etat) {
    return { ok: false, statut: 500, erreur: "Aucun jeton d'état produit." };
  }

  return {
    ok: true,
    url: urlConsentement(config.config, depart.etat),
    expire_at: depart.expire_at,
  };
}

export async function GET(requete: Request) {
  const resultat = await preparer(requete);
  if (!resultat.ok) {
    return Response.json({ erreur: resultat.erreur }, { status: resultat.statut });
  }
  return Response.redirect(resultat.url, 302);
}

export async function POST(requete: Request) {
  const resultat = await preparer(requete);
  if (!resultat.ok) {
    return Response.json({ erreur: resultat.erreur }, { status: resultat.statut });
  }
  return Response.json({ url: resultat.url, expire_at: resultat.expire_at });
}
