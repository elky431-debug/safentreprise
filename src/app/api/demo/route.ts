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
 * ⚠ ENREGISTRER D'ABORD, NOTIFIER ENSUITE. L'insertion est l'opération
 *   principale : une demande écrite en base est acquise, même si aucun email
 *   ne part. Un échec Resend est consigné dans les logs et n'apparaît nulle
 *   part dans la réponse — le visiteur voit son panneau de succès, et la
 *   demande reste consultable dans le back-office.
 *
 * ⚠ `effectif` ET `microsoft_365` ONT LEURS COLONNES DEPUIS LA MIGRATION
 *   20260917. Ils étaient repliés en texte libre dans `message`, donc
 *   impossibles à filtrer. Le champ `message` ne porte plus que ce que la
 *   personne a écrit.
 *
 *   Un repli existe pour le cas où le code tournerait avant la migration :
 *   voir `enregistrer()`. Il est là pour ne pas perdre de prospect pendant
 *   les quelques minutes d'un déploiement mal ordonné, pas pour dispenser
 *   d'appliquer la migration.
 *
 * ⚠ POST /api/demo?verifier=1 — essai des deux emails, sans rien enregistrer.
 *   Protégé par WORKER_SECRET, comme /api/veille.
 */
import { createClient } from "@/lib/supabase/server";
import { EFFECTIFS, REPONSES_MICROSOFT } from "@/lib/demo";
import { notifierDemande, type DemandeDemo } from "@/lib/demo-notification";
import { EMAIL_CONTACT, TELEPHONE_AFFICHE } from "@/lib/contact";

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

/**
 * Message affiché quand la base est injoignable.
 *
 * ⚠ IL DOIT PORTER LES COORDONNÉES. Le visiteur a rempli huit champs et vient
 *   de tout perdre : lui dire « écrivez-nous » sans dire où revient à le
 *   renvoyer chercher dans le pied de page, ou à le perdre.
 */
const MESSAGE_PANNE =
  `Le formulaire est momentanément indisponible. Joignez-nous directement : ` +
  `${TELEPHONE_AFFICHE} ou ${EMAIL_CONTACT}.`;

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

/**
 * Essai des deux emails, sans rien enregistrer.
 *
 * ⚠ PROTÉGÉ PAR `WORKER_SECRET`, comme /api/veille. Sans garde, cette route
 *   publique deviendrait un moyen d'expédier des messages à la boîte de
 *   notification autant de fois qu'on veut.
 *
 * ⚠ LA CONFIRMATION PART VERS L'ADRESSE DE NOTIFICATION, PAS VERS UNE ADRESSE
 *   FOURNIE DANS LA REQUÊTE. Accepter un destinataire en paramètre ferait de
 *   cette route un relais d'envoi anonyme.
 */
async function essai(): Promise<Response> {
  const destination =
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    process.env.VEILLE_DESTINATAIRE?.trim() ||
    EMAIL_CONTACT;

  const factice: DemandeDemo = {
    entreprise: "Essai Safentreprise",
    effectif: EFFECTIFS[0],
    prenom: "Essai",
    nom: "Technique",
    email: destination,
    telephone: TELEPHONE_AFFICHE,
    microsoft365: REPONSES_MICROSOFT[0],
    besoin:
      "Message d'essai déclenché par POST /api/demo?verifier=1. " +
      "Aucune demande n'a été enregistrée.",
  };

  const envois = await notifierDemande(factice);

  return Response.json({
    enregistrement: "aucun — ?verifier=1 n'écrit rien en base",
    destination,
    expediteur:
      process.env.DEMO_FROM_EMAIL?.trim() ||
      process.env.VEILLE_FROM_EMAIL?.trim() ||
      `contact@safentreprise.com (défaut du code)`,
    notification: envois.interne,
    confirmation: envois.confirmation,
  });
}

function autorise(request: Request): boolean {
  const attendu = process.env.WORKER_SECRET;
  if (!attendu) return false;
  const fourni =
    request.headers.get("x-safentreprise-worker") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return fourni === attendu;
}

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.has("verifier")) {
    if (!autorise(request)) {
      return new Response("non autorisé", { status: 401 });
    }
    return essai();
  }

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

  const demande: DemandeDemo = {
    entreprise,
    effectif,
    prenom,
    nom,
    email,
    telephone,
    microsoft365,
    besoin,
  };

  // Sans configuration Supabase (ex. environnement de démo), createClient lève.
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return Response.json({ erreur: MESSAGE_PANNE }, { status: 503 });
  }

  const erreur = await enregistrer(supabase, demande);

  if (erreur) {
    console.error("Insertion demandes_demo :", erreur);
    return Response.json(
      { erreur: "Enregistrement impossible pour le moment. Réessayez." },
      { status: 500 },
    );
  }

  // ⚠ APRÈS L'INSERTION, ET SANS POUVOIR LA REMETTRE EN CAUSE. `notifierDemande`
  //   ne lève jamais ; le `catch` ne couvre qu'un défaut imprévu du module.
  try {
    const envois = await notifierDemande(demande);
    if (!envois.interne.ok) {
      console.error("Notification interne (démo) :", envois.interne.erreur);
    }
    if (!envois.confirmation.ok) {
      console.error("Confirmation demandeur (démo) :", envois.confirmation.erreur);
    }
  } catch (e) {
    console.error("Notification de démo :", e);
  }

  return Response.json({ ok: true }, { status: 201 });
}

/**
 * Insertion, avec repli sur l'ancien format si les colonnes manquent.
 *
 * ⚠ LE REPLI NE SE DÉCLENCHE QUE SUR « COLONNE INCONNUE ». PostgREST répond
 *   PGRST204 — ou le code Postgres 42703 — quand une colonne citée n'existe
 *   pas. Toute autre erreur remonte telle quelle : masquer une panne de
 *   permission ou de réseau derrière un second essai rendrait le diagnostic
 *   impossible.
 *
 * ⚠ CE REPLI EST TRANSITOIRE. Il disparaîtra une fois la migration 20260917
 *   appliquée partout. Tant qu'il sert, l'effectif et la réponse Microsoft 365
 *   repartent en texte libre — et une erreur est écrite dans les logs pour
 *   qu'on ne l'oublie pas.
 */
async function enregistrer(
  // Le type générique du client varie avec la génération des types de base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  d: DemandeDemo,
): Promise<unknown | null> {
  const base = {
    nom: `${d.prenom} ${d.nom}`,
    entreprise: d.entreprise,
    email: d.email,
    telephone: d.telephone,
  };

  const { error } = await supabase.from("demandes_demo").insert({
    ...base,
    effectif: d.effectif,
    microsoft_365: d.microsoft365,
    message: d.besoin || null,
  });

  if (!error) return null;

  const code = String((error as { code?: string }).code ?? "");
  if (code !== "PGRST204" && code !== "42703") return error;

  console.error(
    "demandes_demo : colonnes effectif / microsoft_365 absentes — " +
      "appliquer la migration 20260917. Repli sur le champ message.",
  );

  const { error: erreurRepli } = await supabase.from("demandes_demo").insert({
    ...base,
    message: [
      `Effectif : ${d.effectif}`,
      `Microsoft 365 : ${d.microsoft365}`,
      d.besoin ? `\n${d.besoin}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return erreurRepli ?? null;
}
