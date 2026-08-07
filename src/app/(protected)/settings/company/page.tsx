import { createClient } from "@/lib/supabase/server";
import { CompanySettingsForm } from "@/components/settings/CompanySettingsForm";
import type { Company } from "@/lib/types";

export default async function CompanySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle<Company>();

  if (!company) return null;

  return <CompanySettingsForm company={company} />;
}
