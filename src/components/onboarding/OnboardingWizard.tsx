"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyStep } from "@/components/onboarding/CompanyStep";
import { RiskStep } from "@/components/onboarding/RiskStep";
import { ResultStep } from "@/components/onboarding/ResultStep";
import type { RiskScores } from "@/lib/risk";
import type { Company } from "@/lib/types";

type Step = 1 | 2 | 3;

/** Intitulés de chaque étape, affichés au-dessus de la barre de progression. */
const STEPS: Record<Step, { titre: string; description: string }> = {
  1: {
    titre: "Informations société",
    description:
      "Ces informations personnalisent vos simulations. Le dirigeant à usurper est l'identité dont les fraudeurs se serviraient.",
  },
  2: {
    titre: "Auto-évaluation du risque",
    description:
      "Neuf questions sur vos procédures, vos équipes et vos outils. Répondez au plus juste : le résultat sert de point de départ.",
  },
  3: {
    titre: "Votre exposition",
    description:
      "Voici votre niveau de risque par catégorie. Il sera repris en haut de votre tableau de bord.",
  },
};

type Props = {
  userId: string;
  userEmail: string;
  /** Société déjà créée : le flux reprend directement à l'auto-évaluation. */
  company: Company | null;
};

/**
 * Onboarding en 3 étapes, affiché tant que la société n'est pas configurée
 * (société créée ET auto-évaluation remplie).
 */
export function OnboardingWizard({ userId, userEmail, company }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(company ? 2 : 1);
  const [companyId, setCompanyId] = useState<string | null>(company?.id ?? null);
  const [scores, setScores] = useState<RiskScores | null>(null);

  function terminerEtape1(nouvelId: string) {
    setCompanyId(nouvelId);
    setStep(2);
  }

  function terminerEtape2(nouveauxScores: RiskScores) {
    setScores(nouveauxScores);
    setStep(3);
  }

  /** Le layout ne laisse passer le tableau de bord qu'après rechargement. */
  function terminer() {
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="eyebrow">Étape {step} sur 3</p>

        <h1 className="mt-4 text-[22px] font-semibold text-foreground">
          {STEPS[step].titre}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {STEPS[step].description}
        </p>

        <ProgressBar step={step} />
      </header>

      {step === 1 && (
        <CompanyStep
          userId={userId}
          userEmail={userEmail}
          onDone={terminerEtape1}
        />
      )}

      {step === 2 && companyId && (
        <RiskStep companyId={companyId} onDone={terminerEtape2} />
      )}

      {step === 3 && scores && (
        <ResultStep scores={scores} onFinish={terminer} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Trois segments : franchis en cyan, restants en gris. */
function ProgressBar({ step }: { step: Step }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={3}
      aria-label={`Étape ${step} sur 3`}
      className="mt-6 flex gap-1.5"
    >
      {[1, 2, 3].map((index) => (
        <span
          key={index}
          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
            index <= step ? "bg-accent-text" : "bg-surface-3"
          }`}
        />
      ))}
    </div>
  );
}
