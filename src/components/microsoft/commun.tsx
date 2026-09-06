/**
 * Briques partagées par les écrans du raccordement Microsoft 365.
 *
 * Elles reprennent les jetons de couleur et les tailles du reste de l'espace
 * connecté (voir components/ui.tsx) : le raccordement ne doit pas ressembler à
 * une deuxième application collée à côté de la première.
 */
import type { ReactNode } from "react";
import { ETAPES_VISIBLES, type EtapeRaccordement } from "@/lib/microsoft/etat";

/* --------------------------------------------------------------------------
   Encadré à ton
   -------------------------------------------------------------------------- */

export type Ton = "neutre" | "info" | "succes" | "attention" | "danger";

const TONS: Record<Ton, string> = {
  neutre: "border-border bg-surface-2 text-muted",
  info: "border-accent-line bg-accent-soft text-foreground",
  succes: "border-success/25 bg-success-soft text-foreground",
  attention: "border-warning/30 bg-warning-soft text-foreground",
  danger: "border-danger/25 bg-danger-soft text-foreground",
};

const PASTILLES: Record<Ton, string> = {
  neutre: "bg-faint",
  info: "bg-accent-text",
  succes: "bg-success",
  attention: "bg-warning",
  danger: "bg-danger",
};

/**
 * Un bloc de message avec un titre et un corps.
 *
 * Le composant Alert de components/ui.tsx ne porte qu'une phrase ; ici il faut
 * un titre, une explication, et souvent des actions dessous.
 */
export function Encadre({
  ton,
  titre,
  children,
}: {
  ton: Ton;
  titre?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${TONS[ton]}`}>
      {titre && (
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${PASTILLES[ton]}`}
          />
          {titre}
        </p>
      )}
      <div
        className={`text-[13px] leading-relaxed text-muted ${titre ? "mt-1.5 pl-3.5" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Progression
   -------------------------------------------------------------------------- */

const RANG: Record<EtapeRaccordement, number> = {
  "non-raccorde": 1,
  boites: 2,
  restriction: 3,
  activation: 4,
  actif: 5,
};

/** Le fil des quatre étapes, avec celle où l'on se trouve. */
export function Progression({ etape }: { etape: EtapeRaccordement }) {
  const courant = RANG[etape];

  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {ETAPES_VISIBLES.map((e) => {
        const faite = courant > e.numero;
        const ici = courant === e.numero;

        return (
          <li
            key={e.cle}
            aria-current={ici ? "step" : undefined}
            className={`flex items-center gap-2.5 px-4 py-3 ${
              ici ? "bg-accent-soft" : "bg-surface"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                faite
                  ? "bg-success-soft text-success"
                  : ici
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-faint"
              }`}
            >
              {faite ? "✓" : e.numero}
            </span>
            <span
              className={`text-[12.5px] font-medium ${
                faite || ici ? "text-foreground" : "text-faint"
              }`}
            >
              {e.titre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------------------
   Divers
   -------------------------------------------------------------------------- */

export function Etiquette({
  ton,
  children,
}: {
  ton: Ton;
  children: ReactNode;
}) {
  const styles: Record<Ton, string> = {
    neutre: "border-border bg-surface-2 text-muted",
    info: "border-accent-line bg-accent-soft text-accent-text",
    succes: "border-success/25 bg-success-soft text-success",
    attention: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-danger/25 bg-danger-soft text-danger",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${styles[ton]}`}
    >
      {children}
    </span>
  );
}

/** Date lisible, ou un tiret. Jamais une date fausse pour combler un vide. */
export function dateLisible(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
