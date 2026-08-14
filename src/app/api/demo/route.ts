/**
 * Enregistre une demande de démonstration issue de la landing.
 *
 * POST /api/demo  { nom, entreprise, email, telephone?, message? }
 *
 * L'insertion passe par la politique RLS « demandes_demo_insert_public »
 * (voir supabase/schema.sql) : écriture publique autorisée, lecture réservée
 * au back-office Supabase.
 */
import { createClient } from "@/lib/supabase/server";

type Corps = {
  nom?: string;
  entreprise?: string;
  email?: string;
  telephone?: string;
  message?: string;
};

/** Validation volontairement souple : on filtre les saisies manifestement fausses. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LONGUEUR_MAX = {
  nom: 120,
  entreprise: 160,
  email: 200,
  telephone: 40,
  message: 2000,
};

export async function POST(request: Request) {
  let corps: Corps;
  try {
    corps = (await request.json()) as Corps;
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const nom = corps.nom?.trim() ?? "";
  const entreprise = corps.entreprise?.trim() ?? "";
  const email = corps.email?.trim().toLowerCase() ?? "";
  const telephone = corps.telephone?.trim() ?? "";
  const message = corps.message?.trim() ?? "";

  if (!nom || !entreprise || !email) {
    return Response.json(
      { erreur: "Nom, entreprise et email professionnel sont obligatoires." },
      { status: 400 },
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return Response.json(
      { erreur: "Cette adresse email ne semble pas valide." },
      { status: 400 },
    );
  }

  if (
    nom.length > LONGUEUR_MAX.nom ||
    entreprise.length > LONGUEUR_MAX.entreprise ||
    email.length > LONGUEUR_MAX.email ||
    telephone.length > LONGUEUR_MAX.telephone ||
    message.length > LONGUEUR_MAX.message
  ) {
    return Response.json(
      { erreur: "Un des champs dépasse la longueur autorisée." },
      { status: 400 },
    );
  }

  // Sans configuration Supabase (ex. environnement de démo), createClient lève.
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return Response.json(
      {
        erreur:
          "Le formulaire n'est pas encore relié à la base. Écrivez-nous directement en attendant.",
      },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("demandes_demo").insert({
    nom,
    entreprise,
    email,
    telephone: telephone || null,
    message: message || null,
  });

  if (error) {
    console.error("Insertion demandes_demo :", error);
    return Response.json(
      { erreur: "Enregistrement impossible pour le moment. Réessayez." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 201 });
}
