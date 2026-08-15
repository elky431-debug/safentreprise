/**
 * Vérifie un code d'activation saisi dans l'extension Safentreprise Guard.
 *
 * POST /api/extension/verifier-code   { code_activation }
 *   200 → { valide: true, societe: "Martin & Associés" }
 *   401 → { valide: false }
 *
 * Aucune donnée n'est exposée sans code valide : la réponse se limite au nom
 * de la société, afin que l'employé confirme qu'il active la bonne.
 */
import { createClient } from "@/lib/supabase/server";
import { reponseCors, reponsePreflight } from "@/lib/extension/cors";

export async function OPTIONS() {
  return reponsePreflight();
}

export async function POST(request: Request) {
  let corps: { code_activation?: string };
  try {
    corps = (await request.json()) as { code_activation?: string };
  } catch {
    return reponseCors({ valide: false, erreur: "JSON invalide." }, 400);
  }

  const code = corps.code_activation?.trim().toUpperCase() ?? "";
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

  const { data, error } = await supabase.rpc("verifier_code_activation", {
    p_code: code,
  });

  if (error) {
    console.error("verifier_code_activation :", error);
    return reponseCors({ valide: false, erreur: "Vérification impossible." }, 500);
  }

  // La fonction renvoie le nom de la société, ou null si le code est inconnu.
  const societe = data as string | null;
  if (!societe) {
    return reponseCors({ valide: false }, 401);
  }

  return reponseCors({ valide: true, societe });
}
