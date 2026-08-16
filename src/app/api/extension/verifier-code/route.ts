/**
 * Vérifie un code d'activation saisi dans l'extension Safentreprise Guard.
 *
 * POST /api/extension/verifier-code   { code_activation, employe_email? }
 *   200 → { valide: true, societe: "Martin & Associés" }
 *   401 → { valide: false }
 *
 * Aucune donnée n'est exposée sans code valide : la réponse se limite au nom
 * de la société, afin que l'employé confirme qu'il active la bonne.
 *
 * Quand `employe_email` accompagne un code valide, l'activation est
 * enregistrée (ou rafraîchie) dans activations_extension. C'est ce qui permet
 * au tableau de bord de compter les collaborateurs réellement protégés.
 * Le champ reste facultatif : sans lui, la route se comporte comme avant.
 */
import { createClient } from "@/lib/supabase/server";
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";

export async function OPTIONS() {
  return reponsePreflight();
}

/** Longueur maximale acceptée pour une adresse (RFC 5321). */
const LONGUEUR_MAX_EMAIL = 320;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let corps: { code_activation?: string; employe_email?: string };
  try {
    corps = (await request.json()) as {
      code_activation?: string;
      employe_email?: string;
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

  // Cette fonction valide le code ET, si une adresse est fournie, enregistre
  // l'activation du collaborateur (upsert sur company_id + employe_email).
  const { data, error } = await supabase.rpc("enregistrer_activation_extension", {
    p_code: code,
    p_employe_email: employeEmail,
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
