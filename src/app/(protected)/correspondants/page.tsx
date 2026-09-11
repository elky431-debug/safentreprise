import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CorrespondantsManager } from "@/components/CorrespondantsManager";
import type { Company, CorrespondantConfiance } from "@/lib/types";

/**
 * Correspondants de confiance — liste, ajout, modification, import.
 *
 * ⚠ LA LECTURE PASSE PAR LE CLIENT SERVEUR À CLÉ ANONYME, donc par la RLS.
 *   `.eq("company_id", …)` n'est qu'un filtre de confort : ce qui garantit
 *   qu'un dirigeant ne voit que ses correspondants est la politique
 *   `correspondants_select_own`, pas cette ligne.
 */
export default async function CorrespondantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Company>();

  if (!company) return null;

  const { data: correspondants } = await supabase
    .from("correspondants_confiance")
    .select("*")
    .eq("company_id", company.id)
    .order("nom", { ascending: true })
    .returns<CorrespondantConfiance[]>();

  return (
    <CorrespondantsManager
      companyId={company.id}
      initiaux={correspondants ?? []}
    />
  );
}
