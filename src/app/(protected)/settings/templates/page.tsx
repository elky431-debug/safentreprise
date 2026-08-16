import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "@/components/settings/TemplatesManager";
import type { Company, MessageTemplate } from "@/lib/types";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle<Pick<Company, "id">>();

  if (!company) {
    return null;
  }

  // La RLS ne renvoie que les gabarits système et ceux de la société.
  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .order("type_fraude")
    .order("canal")
    .returns<MessageTemplate[]>();

  return (
    <TemplatesManager initial={data ?? []} companyId={company.id} />
  );
}
