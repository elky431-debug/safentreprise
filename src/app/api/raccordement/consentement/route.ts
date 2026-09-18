/**
 * Départ vers Microsoft, depuis un jeton.
 *
 * ⚠ C'EST LE JUMEAU ANONYME DE `/api/microsoft/consentement/demarrer`, ET LES
 *   DEUX COEXISTENT. Celle-là exige une session et sert le dirigeant qui
 *   installe lui-même ; celle-ci sert l'informaticien, qui n'a pas de compte.
 *   Ne pas fusionner les deux « pour ne pas dupliquer » : c'est la séparation
 *   qui garantit qu'un bug ici ne peut pas casser le parcours en session.
 */
import { jetonPropre } from "@/lib/raccordement/jeton-serveur";
import { createClient } from "@/lib/supabase/server";
import {
  adresseAppelante,
  configurationConsentement,
  urlConsentement,
} from "@/lib/microsoft/consentement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(requete: Request) {
  const config = configurationConsentement();
  if (!config.ok) {
    console.error("[raccordement] configuration :", config.erreur);
    return Response.json({ erreur: config.erreur }, { status: 500 });
  }

  let corps: { jeton?: unknown };
  try {
    corps = (await requete.json()) as { jeton?: unknown };
  } catch {
    return Response.json({ erreur: "corps illisible" }, { status: 400 });
  }

  const jeton = jetonPropre(corps.jeton);
  if (!jeton) return Response.json({ erreur: "jeton absent" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("demarrer_consentement_par_jeton", {
    p_jeton: jeton,
    p_email: null,
    p_ip: adresseAppelante(requete),
  });

  if (error) {
    // ⚠ NE PAS DEVINER LA CAUSE — on rend le message de Postgres. Une version
    //   antérieure de la route en session répondait « votre compte est-il
    //   rattaché à une société ? » pour n'importe quelle erreur, et l'échec
    //   réel était une fonction introuvable : le message envoyait chercher au
    //   mauvais endroit.
    console.error("[raccordement] demarrer_consentement_par_jeton :", error);
    return Response.json(
      { erreur: error.message ?? "démarrage impossible" },
      { status: 400 },
    );
  }

  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { etat?: string }
    | undefined;
  if (!ligne?.etat) {
    return Response.json({ erreur: "état non délivré" }, { status: 500 });
  }

  return Response.json({ url: urlConsentement(config.config, ligne.etat) });
}
