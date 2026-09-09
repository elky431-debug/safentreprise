/**
 * Enregistre une demande de démonstration issue de la vitrine.
 *
 * POST /api/demo
 *   { entreprise, effectif, prenom, nom, email, telephone, microsoft365, besoin? }
 *
 * L'insertion passe par la politique RLS « demandes_demo_insert_public »
 * (voir supabase/schema.sql) : écriture publique autorisée, lecture réservée
 * au back-office Supabase.
 *
 * ⚠ QUATRE RÉPONSES N'ONT PAS DE COLONNE : effectif, usage de Microsoft 365,
 *   et la séparation prénom / nom. La table `demandes_demo` n'a que nom,
 *   entreprise, email, telephone, message. Plutôt que de les jeter — un
 *   formulaire qui collecte une donnée pour la perdre est pire qu'un
 *   formulaire qui ne la demande pas — elles sont recomposées en tête du
 *   champ `message`, sous une forme lisible en back-office.
 *
 *   C'est un pis-aller assumé : on ne peut pas filtrer les demandes par
 *   effectif. Les passer en colonnes demande une migration.
 */
import { createClient } from "@/lib/supabase/server";
import { EFFECTIFS, REPONSES_MICROSOFT } from "@/lib/demo";

type Corps = {
  entreprise?: string;
  effectif?: string;
  prenom?: string;
  nom?: string;
  email?: string;
  telephone?: string;
  microsoft365?: string;
  besoin?: string;
};

/** Validation volontairement souple : on filtre les saisies manifestement fausses. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LONGUEUR_MAX = {
  entreprise: 160,
  prenom: 80,
  nom: 80,
  email: 200,
  telephone: 40,
  besoin: 2000,
};

export async function POST(request: Request) {
  let corps: Corps;
  try {
    corps = (await request.json()) as Corps;
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const entreprise = corps.entreprise?.trim() ?? "";
  const effectif = corps.effectif?.trim() ?? "";
  const prenom = corps.prenom?.trim() ?? "";
  const nom = corps.nom?.trim() ?? "";
  const email = corps.email?.trim().toLowerCase() ?? "";
  const telephone = corps.telephone?.trim() ?? "";
  const microsoft365 = corps.microsoft365?.trim() ?? "";
  const besoin = corps.besoin?.trim() ?? "";

  if (!entreprise || !prenom || !nom || !email || !telephone) {
    return Response.json(
      {
        erreur:
          "Entreprise, prénom, nom, email professionnel et téléphone sont obligatoires.",
      },
      { status: 400 },
    );
  }

  // Les listes déroulantes sont vérifiées côté serveur : le navigateur n'est
  // pas le seul appelant possible de cette route.
  if (!EFFECTIFS.includes(effectif as (typeof EFFECTIFS)[number])) {
    return Response.json(
      { erreur: "Effectif inconnu." },
      { status: 400 },
    );
  }

  if (
    !REPONSES_MICROSOFT.includes(
      microsoft365 as (typeof REPONSES_MICROSOFT)[number],
    )
  ) {
    return Response.json(
      { erreur: "Réponse inattendue sur Microsoft 365." },
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
    entreprise.length > LONGUEUR_MAX.entreprise ||
    prenom.length > LONGUEUR_MAX.prenom ||
    nom.length > LONGUEUR_MAX.nom ||
    email.length > LONGUEUR_MAX.email ||
    telephone.length > LONGUEUR_MAX.telephone ||
    besoin.length > LONGUEUR_MAX.besoin
  ) {
    return Response.json(
      { erreur: "Un des champs dépasse la longueur autorisée." },
      { status: 400 },
    );
  }

  const message = [
    `Effectif : ${effectif}`,
    `Microsoft 365 : ${microsoft365}`,
    besoin ? `\n${besoin}` : null,
  ]
    .filter(Boolean)
    .join("\n");

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
    nom: `${prenom} ${nom}`,
    entreprise,
    email,
    telephone,
    message,
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
