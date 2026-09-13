/**
 * Enregistre une réponse au questionnaire public /diagnostic.
 *
 * POST /api/diagnostic
 *   { reponses: { effectif, messagerie, … }, score, email?, id? }
 *   → 201 { id }
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
 * ⚠ CETTE ROUTE ÉCRIT AVEC LA CLÉ DE SERVICE, ET C'EST CE QUI PERMET À LA
 *   TABLE DE N'AVOIR AUCUNE POLITIQUE RLS. Le navigateur ne touche jamais
 *   `diagnostics_exposition` : il ne peut donc ni la lire, ni la modifier, ni
 *   deviner son contenu. Voir `20261004_diagnostic_exposition.sql`.
 *
 * ⚠ UN ÉCHEC ICI NE DOIT PAS ÊTRE VISIBLE DU RÉPONDANT. Le score est calculé
 *   et affiché dans le navigateur ; l'enregistrement est un effet de bord pour
 *   nous. La route répond quand même une erreur franche — c'est ce qui permet
 *   de la diagnostiquer — mais le composant ne l'affiche nulle part.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {
  QUESTIONS,
  calculerScore,
  nettoyerDomaine,
  type CleQuestion,
  type Reponses,
} from "@/lib/diagnostic";

type Corps = {
  reponses?: Record<string, unknown>;
  score?: unknown;
  email?: unknown;
  id?: unknown;
};

/** Validation volontairement souple : on filtre les saisies manifestement fausses. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LONGUEUR_MAX_EMAIL = 200;

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

  const email =
    typeof corps.email === "string"
      ? corps.email.trim().toLowerCase().slice(0, LONGUEUR_MAX_EMAIL)
      : "";

  if (email && !EMAIL_REGEX.test(email)) {
    return Response.json(
      { erreur: "Cette adresse email ne semble pas valide." },
      { status: 400 },
    );
  }

  const id =
    typeof corps.id === "string" && UUID_REGEX.test(corps.id) ? corps.id : null;

  // ⚠ AUCUNE RÉPONSE ET AUCUNE ADRESSE : rien à enregistrer. Sans cette garde,
  //   un robot remplirait la table de lignes vides.
  if (Object.keys(reponses).length === 0 && !email) {
    return Response.json({ erreur: "Aucune réponse." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    console.error(
      "/api/diagnostic : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY absent.",
    );
    return Response.json({ erreur: "Enregistrement indisponible." }, { status: 503 });
  }

  const parametres: Record<string, unknown> = {
    p_score: calculerScore(reponses),
    p_email: email || null,
    p_id: id,
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

  return Response.json({ id: identifiant }, { status: 201 });
}
