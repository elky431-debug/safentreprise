import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "@/components/settings/TemplatesManager";
import type { MessageTemplate } from "@/lib/types";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .order("type_fraude")
    .order("canal")
    .returns<MessageTemplate[]>();

  return <TemplatesManager initial={data ?? []} />;
}
