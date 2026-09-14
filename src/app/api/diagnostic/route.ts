/**
 * Enregistre une réponse au questionnaire public /diagnostic, et notifie.
 *
 * POST /api/diagnostic
 *   { reponses: { effectif, messagerie, … }, score, id?,
 *     prenom?, nom?, email?, entreprise? }
 *   → 201 { id }
 *
 * Deux appels par parcours :
 *   1. à l'affichage du score, sans coordonnées — c'est lui qui crée la ligne ;
 *   2. à la soumission du formulaire, avec les quatre champs et l'`id` rendu
 *      par le premier — c'est lui qui déclenche l'analyse au prospect.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ LE SCORE REÇU EST IGNORÉ. Il est recalculé ici, à partir des réponses, par
 *   la même fonction que celle du navigateur. Le champ reste accepté dans le
 *   corps pour ne pas casser un appel, mais rien n'en dépend : sans ça, la
 *   seule mesure qu'on ait de ce que répondent les prospects serait celle que
 *   veut bien lui envoyer le navigateur.
 *
 * ⚠ LES RÉPONSES SONT VÉRIFIÉES CONTRE LES LISTES DU QUESTIONNAIRE. Une valeur
 *   inconnue n'est pas enregistrée en texte libre : elle est écartée. La table
 *   reste donc agrégeable, et ne devient pas un champ de saisie déguisé.
 *
 * ⚠ LES QUATRE COORDONNÉES SONT INDISSOCIABLES. Trois champs sur quatre ne
 *   valent rien commercialement et restent une donnée personnelle à conserver :
 *   la route refuse l'ensemble plutôt que d'enregistrer un contact incomplet.
 *
 * ⚠ CETTE ROUTE ÉCRIT AVEC LA CLÉ DE SERVICE, ET C'EST CE QUI PERMET À LA
 *   TABLE DE N'AVOIR AUCUNE POLITIQUE RLS. Le navigateur ne touche jamais
 *   `diagnostics_exposition`. Voir `20261004` et `20261005`.
 *
 * ⚠ L'ENVOI DES EMAILS NE PEUT NI FAIRE ÉCHOUER L'ENREGISTREMENT NI LE
 *   PRÉCÉDER. L'ordre est imposé : enregistrer, puis notifier. Un échec Resend
 *   est consigné dans les logs et n'apparaît pas dans la réponse — la page
 *   révèle l'analyse de toute façon, le visiteur a rempli sa part.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {
  QUESTIONS,
  calculerScore,
  nettoyerDomaine,
  type CleQuestion,
  type Reponses,
} from "@/lib/diagnostic";
import { notifierDiagnostic } from "@/lib/diagnostic-notification";
import type { Coordonnees } from "@/lib/diagnostic-email";

type Corps = {
  reponses?: Record<string, unknown>;
  score?: unknown;
  id?: unknown;
  prenom?: unknown;
  nom?: unknown;
  email?: unknown;
  entreprise?: unknown;
};

/** Validation volontairement souple : on filtre les saisies manifestement fausses. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LONGUEUR_MAX = {
  prenom: 80,
  nom: 80,
  email: 200,
  entreprise: 160,
};

/**
 * Ne garde que des valeurs présentes dans les listes du questionnaire.
 *
 * Le domaine est la seule saisie libre : il passe par `nettoyerDomaine`, testé
 * dans `diagnostic.test.ts`.
 */
function nettoyer(brut: Record<string, unknown>): Reponses {
  const propres: Reponses = {};

  for (const question of QUESTIONS) {
    const valeur = brut[question.cle];
    if (typeof valeur !== "string") continue;

    if (question.options) {
      if (question.options.some((o) => o.valeur === valeur)) {
        propres[question.cle] = valeur;
      }
      continue;
    }

    // Saisie libre : le domaine.
    const domaine = nettoyerDomaine(valeur);
    if (domaine) propres[question.cle] = domaine;
  }

  return propres;
}

/** Un champ texte du formulaire : coupé, jamais transformé. */
function champ(valeur: unknown, max: number): string {
  return typeof valeur === "string" ? valeur.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let corps: Corps;
  try {
    corps = (await request.json()) as Corps;
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const reponses = nettoyer(
    typeof corps.reponses === "object" && corps.reponses !== null
      ? (corps.reponses as Record<string, unknown>)
      : {},
  );

  const prenom = champ(corps.prenom, LONGUEUR_MAX.prenom);
  const nom = champ(corps.nom, LONGUEUR_MAX.nom);
  const entreprise = champ(corps.entreprise, LONGUEUR_MAX.entreprise);
  const email = champ(corps.email, LONGUEUR_MAX.email).toLowerCase();

  const aucuneCoordonnee = !prenom && !nom && !entreprise && !email;

  let coordonnees: Coordonnees | null = null;
  if (!aucuneCoordonnee) {
    if (!prenom || !nom || !entreprise || !email) {
      return Response.json(
        { erreur: "Prénom, nom, email professionnel et entreprise sont tous requis." },
        { status: 400 },
      );
    }
    if (!EMAIL_REGEX.test(email)) {
      return Response.json(
        { erreur: "Cette adresse email ne semble pas valide." },
        { status: 400 },
      );
    }
    coordonnees = { prenom, nom, email, entreprise };
  }

  const id =
    typeof corps.id === "string" && UUID_REGEX.test(corps.id) ? corps.id : null;

  // ⚠ AUCUNE RÉPONSE ET AUCUNE COORDONNÉE : rien à enregistrer. Sans cette
  //   garde, un robot remplirait la table de lignes vides.
  if (Object.keys(reponses).length === 0 && !coordonnees) {
    return Response.json({ erreur: "Aucune réponse." }, { status: 400 });
  }

  const score = calculerScore(reponses);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    console.error(
      "/api/diagnostic : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.",
    );
    return Response.json({ erreur: "Enregistrement indisponible." }, { status: 503 });
  }

  const parametres: Record<string, unknown> = {
    p_score: score,
    p_id: id,
    p_prenom: coordonnees?.prenom ?? null,
    p_nom: coordonnees?.nom ?? null,
    p_email: coordonnees?.email ?? null,
    p_entreprise: coordonnees?.entreprise ?? null,
  };

  for (const cleQuestion of Object.keys(reponses) as CleQuestion[]) {
    parametres[`p_${cleQuestion}`] = reponses[cleQuestion] ?? null;
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${url}/rest/v1/rpc/enregistrer_diagnostic`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parametres),
    });
  } catch (e) {
    console.error("/api/diagnostic : appel Supabase impossible —", e);
    return Response.json({ erreur: "Enregistrement impossible." }, { status: 502 });
  }

  if (!reponse.ok) {
    // ⚠ LE CORPS DE L'ERREUR RESTE DANS LES LOGS. Il nomme parfois des colonnes
    //   et des contraintes : ça n'a rien à faire dans une réponse publique.
    console.error(
      `/api/diagnostic : enregistrer_diagnostic a répondu ${reponse.status} —`,
      await reponse.text().catch(() => "(corps illisible)"),
    );
    return Response.json({ erreur: "Enregistrement impossible." }, { status: 500 });
  }

  const identifiant = (await reponse.json().catch(() => null)) as string | null;

  // ⚠ APRÈS L'ENREGISTREMENT, ET SANS POUVOIR LE REMETTRE EN CAUSE.
  //   `notifierDiagnostic` ne lève jamais ; le `catch` ne couvre qu'un défaut
  //   imprévu du module.
  //
  // ⚠ LE SORT DE L'ANALYSE EST RENDU, CELUI DE LA FICHE INTERNE NON. La page
  //   annonce au visiteur qu'une copie lui arrive par email : elle doit
  //   pouvoir le dire seulement si c'est vrai, et le corriger sinon. Notre
  //   fiche interne, elle, ne le regarde pas — elle se diagnostique dans les
  //   logs.
  let analyseEnvoyee = false;
  try {
    const envois = await notifierDiagnostic(score, reponses, coordonnees);
    if (!envois.interne.ok) {
      console.error("Fiche interne (diagnostic) :", envois.interne.erreur);
    }
    if (envois.analyse && !envois.analyse.ok) {
      console.error("Analyse au prospect (diagnostic) :", envois.analyse.erreur);
    }
    analyseEnvoyee = envois.analyse?.ok === true;
  } catch (e) {
    console.error("Notification de diagnostic :", e);
  }

  return Response.json({ id: identifiant, analyseEnvoyee }, { status: 201 });
}
