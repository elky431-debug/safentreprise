import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeesManager } from "@/components/EmployeesManager";
import type { Company, Employee } from "@/lib/types";

/** Page Employés — liste, ajout, import CSV/Excel, suppression. */
export default async function EmployeesPage() {
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

  // Si pas encore de société, le layout affiche l'onboarding
  if (!company) return null;

  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true })
    .returns<Employee[]>();

  return (
    <EmployeesManager
      companyId={company.id}
      initialEmployees={employees ?? []}
    />
  );
}
