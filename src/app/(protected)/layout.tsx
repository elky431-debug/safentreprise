import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, LogoutButton } from "@/components/DashboardShell";
import { Logo } from "@/components/Logo";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import type { Company, RiskAssessment } from "@/lib/types";

/**
 * Layout protégé partagé : navigation + en-tête.
 * Tant que la société n'est pas configurée (créée ET auto-évaluée),
 * l'onboarding en 3 étapes remplace toute l'interface.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Company>();

  // Dernière auto-évaluation : son absence signifie onboarding inachevé
  let assessment: RiskAssessment | null = null;
  if (company) {
    const { data } = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RiskAssessment>();

    assessment = data;
  }

  // Flux d'onboarding : plein écran, sans navigation, pour éviter les sorties
  if (!company || !assessment) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-5 lg:px-8">
          <Logo />
          <LogoutButton />
        </header>

        <main className="flex-1 px-5 py-10 lg:py-14">
          <OnboardingWizard
            userId={user.id}
            userEmail={user.email ?? ""}
            company={company}
          />
        </main>
      </div>
    );
  }

  return (
    <AppShell companyName={company.nom} userEmail={user.email ?? ""}>
      {children}
    </AppShell>
  );
}
