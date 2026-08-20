/**
 * Vérifie un code d'activation saisi dans l'extension Safentreprise Guard.
 *
 * POST /api/extension/verifier-code
 *   { code_activation, employe_email?, poste_id? }
 *   200 → { valide: true, societe: "Martin & Associés" }
 *   401 → { valide: false }
 *
 * Aucune donnée n'est exposée sans code valide : la réponse se limite au nom
 * de la société, afin que l'employé confirme qu'il active la bonne.
 *
 * ENRÔLEMENT — quand `employe_email` ET `poste_id` accompagnent un code
 * valide, l'activation est enregistrée ou rafraîchie dans
 * activations_extension. C'est ce qui alimente le compteur des collaborateurs
 * protégés. Les deux champs restent facultatifs : sans eux, la route se
 * limite à valider le code, comme à l'origine.
 */
import { createClient } from "@/lib/supabase/server";
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";

export async function OPTIONS() {
  return reponsePreflight();
}

/** Longueur maximale acceptée pour une adresse (RFC 5321). */
const LONGUEUR_MAX_EMAIL = 320;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** UUID v4 tiré par l'extension au premier lancement, identifiant le poste. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let corps: {
    code_activation?: string;
    employe_email?: string;
    poste_id?: string;
  };
  try {
    corps = (await request.json()) as {
      code_activation?: string;
      employe_email?: string;
      poste_id?: string;
    };
  } catch {
    return reponseCors({ valide: false, erreur: "JSON invalide." }, 400);
  }

  const code = corps.code_activation?.trim().toUpperCase() ?? "";

  // Adresse facultative : on ne transmet que ce qui ressemble à un email.
  const emailBrut = corps.employe_email?.trim().toLowerCase() ?? "";
  const employeEmail =
    emailBrut && emailBrut.length <= LONGUEUR_MAX_EMAIL && EMAIL_REGEX.test(emailBrut)
      ? emailBrut
      : null;

  // Poste facultatif : rejeté s'il n'a pas la forme d'un UUID, pour ne pas
  // laisser la base arbitrer un cast qui échouerait.
  const posteBrut = corps.poste_id?.trim().toLowerCase() ?? "";
  const posteId = UUID_REGEX.test(posteBrut) ? posteBrut : null;

  if (!code) {
    return reponseCors(
      { valide: false, erreur: "Code d'activation manquant." },
      400,
    );
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reponseCors(
      { valide: false, erreur: "Service indisponible." },
      503,
    );
  }

  // Valide le code et, si adresse ET poste sont fournis, enregistre
  // l'activation (upsert sur company_id + poste_id).
  // Signature établie par 20260820_poste_id_activations.sql, qui retire au
  // passage les variantes ambiguës.
  const { data, error } = await supabase.rpc("enregistrer_activation_extension", {
    p_code: code,
    p_employe_email: employeEmail,
    p_poste_id: posteId,
  });

  if (error) {
    console.error("enregistrer_activation_extension :", error);
    return reponseCors({ valide: false, erreur: "Vérification impossible." }, 500);
  }

  // La fonction renvoie le nom de la société, ou null si le code est inconnu.
  const societe = data as string | null;
  if (!societe) {
    return reponseCors({ valide: false }, 401);
  }

  return reponseCors({ valide: true, societe });
}
