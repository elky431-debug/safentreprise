import { createClient } from "@/lib/supabase/server";
import {
  FormationsManager,
  type QuizQuestionRow,
} from "@/components/settings/FormationsManager";
import type { Company } from "@/lib/types";

export default async function FormationsPage() {
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

  // La RLS ne renvoie que les questions système et celles de la société.
  const { data } = await supabase
    .from("quiz_questions")
    .select("*")
    .order("ordre", { ascending: true });

  const initial: QuizQuestionRow[] = (data ?? []).map((q) => ({
    id: q.id,
    company_id: q.company_id ?? null,
    type_fraude: q.type_fraude,
    question: q.question,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
    bonne_reponse: q.bonne_reponse,
    ordre: q.ordre,
    actif: q.actif,
  }));

  return <FormationsManager initial={initial} companyId={company.id} />;
}
