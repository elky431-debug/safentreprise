import { STATUT_LABELS } from "@/lib/campaigns";
import type { StatutCampagne } from "@/lib/types";

/** Couleur par statut : neutre en brouillon, cyan quand prête, vert à l'envoi. */
const TONS: Record<StatutCampagne, string> = {
  brouillon: "border-border-strong bg-surface-2 text-muted",
  prete: "border-accent-line bg-accent-soft text-accent-text",
  envoyee: "border-success/25 bg-success-soft text-success",
};

export function StatutBadge({ statut }: { statut: StatutCampagne }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${TONS[statut]}`}
    >
      {STATUT_LABELS[statut]}
    </span>
  );
}
