import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import type {
  Branding,
  CanalMessage,
  Company,
  Employee,
  Supplier,
  TypeFraude,
} from "@/lib/types";

/** Création d'une campagne : scénario, marque, cibles, composition gabarit. */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
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

  // Préremplissage depuis une relance (?cibles=id,id&nom=&type=&canal=)
  const ciblesParam = premiereValeur(params.cibles);
  const typeParam = premiereValeur(params.type);
  const canalParam = premiereValeur(params.canal);
  const nomParam = premiereValeur(params.nom);

  const prefill = {
    nom: nomParam || undefined,
    typeFraude:
      typeParam === "fournisseur" || typeParam === "president"
        ? (typeParam as TypeFraude)
        : undefined,
    canal:
      canalParam === "email" || canalParam === "sms"
        ? (canalParam as CanalMessage)
        : undefined,
    cibles: ciblesParam
      ? ciblesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
  };

  return (
    <CampaignForm
      companyId={company.id}
      nomEntreprise={company.nom}
      nomDirigeant={company.nom_dirigeant}
      employees={employees ?? []}
      brandingInitial={branding}
      suppliersInitial={suppliers ?? []}
      prefill={prefill}
    />
  );
}

function premiereValeur(
  v: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
