import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import type { Branding, Company, Employee, Supplier } from "@/lib/types";

/** Création d'une campagne : scénario, marque, cibles, composition gabarit. */
export default async function NewCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle<Company>();

  if (!company) {
    return null;
  }

  const [{ data: employees }, { data: branding }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("company_id", company.id)
        .order("prenom", { ascending: true })
        .returns<Employee[]>(),
      supabase
        .from("branding")
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle<Branding>(),
      supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", company.id)
        .order("nom", { ascending: true })
        .returns<Supplier[]>(),
    ]);

  return (
    <CampaignForm
      companyId={company.id}
      nomEntreprise={company.nom}
      nomDirigeant={company.nom_dirigeant}
      employees={employees ?? []}
      brandingInitial={branding}
      suppliersInitial={suppliers ?? []}
    />
  );
}
