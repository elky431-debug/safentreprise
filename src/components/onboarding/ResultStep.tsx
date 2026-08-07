"use client";

import { RiskScoreBars } from "@/components/RiskScoreBars";
import { buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { riskHeadline, type RiskScores } from "@/lib/risk";

type Props = {
  scores: RiskScores;
  onFinish: () => void;
};

/** Étape 3 : restitution des scores et accroche vers le tableau de bord. */
export function ResultStep({ scores, onFinish }: Props) {
  const { titre, message } = riskHeadline(scores);

  return (
    <div className="space-y-5">
      <RiskScoreBars scores={scores} />

      {/* Accroche fondée sur la catégorie la plus exposée */}
      <div className="rounded-[10px] border border-accent-line bg-accent-soft px-5 py-4">
        <p className="text-[14px] font-semibold text-foreground">{titre}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {message}
        </p>
      </div>

      <button
        type="button"
        onClick={onFinish}
        className={`${buttonPrimary} h-10 w-full`}
      >
        Accéder à mon tableau de bord
        <IconArrowRight />
      </button>
    </div>
  );
}
