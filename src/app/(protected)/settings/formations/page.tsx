import { createClient } from "@/lib/supabase/server";
import {
  FormationsManager,
  type QuizQuestionRow,
} from "@/components/settings/FormationsManager";

export default async function FormationsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_questions")
    .select("*")
    .order("ordre", { ascending: true });

  const initial: QuizQuestionRow[] = (data ?? []).map((q) => ({
    id: q.id,
    type_fraude: q.type_fraude,
    question: q.question,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
    bonne_reponse: q.bonne_reponse,
    ordre: q.ordre,
    actif: q.actif,
  }));

  return <FormationsManager initial={initial} />;
}
