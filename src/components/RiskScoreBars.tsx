import { Panel } from "@/components/ui";
import {
  RISK_CATEGORY_LABELS,
  RISK_CATEGORY_ORDER,
  RISK_LEVEL_LABELS,
  riskLevel,
  type RiskScores,
} from "@/lib/risk";

/**
 * Exposition au risque : score global en anneau + barres par catégorie.
 * Palette monochrome (blanc) — le niveau se lit par le libellé, pas la couleur.
 */

type Props = {
  scores: RiskScores;
  /** Date de l'évaluation, affichée en sous-titre quand elle est connue. */
  evaluatedAt?: string;
};

export function RiskScoreBars({ scores, evaluatedAt }: Props) {
  const niveauGlobal = riskLevel(scores.global);

  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,220px)_1fr]">
        {/* Score global — anneau */}
        <div className="flex flex-col items-center justify-center gap-4 border-b border-border bg-surface-2/50 px-6 py-8 lg:border-b-0 lg:border-r">
          <ScoreRing pourcentage={scores.global} />
          <div className="text-center">
            <p className="text-[13px] font-semibold text-foreground">
              {RISK_LEVEL_LABELS[niveauGlobal]}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {evaluatedAt
                ? `Évalué le ${formatDate(evaluatedAt)}`
                : "Auto-évaluation"}
            </p>
          </div>
        </div>

        {/* Détail par catégorie */}
        <div className="px-6 py-6">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
            Exposition au risque
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Trois axes issus de votre questionnaire d&apos;onboarding.
          </p>

          <ul className="mt-6 space-y-5">
            {RISK_CATEGORY_ORDER.map((categorie) => (
              <RiskBar
                key={categorie}
                label={RISK_CATEGORY_LABELS[categorie]}
                pourcentage={scores[categorie]}
              />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function ScoreRing({ pourcentage }: { pourcentage: number }) {
  const rayon = 52;
  const circonference = 2 * Math.PI * rayon;
  const progression = Math.min(Math.max(pourcentage, 0), 100) / 100;
  const offset = circonference * (1 - progression);

  return (
    <div className="relative h-[128px] w-[128px]">
      <svg
        viewBox="0 0 128 128"
        className="h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-border-strong"
        />
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={offset}
          className="stroke-foreground transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="tabular text-[32px] font-semibold leading-none tracking-[-0.04em] text-foreground">
          {pourcentage}
          <span className="ml-0.5 text-[16px] font-medium text-muted">%</span>
        </p>
      </div>
    </div>
  );
}

function RiskBar({
  label,
  pourcentage,
}: {
  label: string;
  pourcentage: number;
}) {
  return (
    <li>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium text-foreground">{label}</span>
        <span className="tabular text-[13.5px] font-semibold text-foreground">
          {pourcentage}&nbsp;%
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Risque ${label.toLowerCase()}`}
        aria-valuenow={pourcentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(pourcentage, 3)}%` }}
        />
      </div>
    </li>
  );
}

/** Date lisible en français, ex. « 5 août 2026 ». */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
