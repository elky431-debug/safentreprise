/**
 * Primitives d'interface partagées.
 * Les classes sont centralisées ici pour garder une cohérence visuelle
 * entre la landing, les pages d'authentification et le tableau de bord.
 */
import type { InputHTMLAttributes, ReactNode } from "react";

/* --------------------------------------------------------------------------
   Boutons
   -------------------------------------------------------------------------- */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-[13.5px] font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-55";

export const buttonPrimary = `${buttonBase} h-10 bg-accent px-4 text-white hover:bg-accent-hover`;

export const buttonSecondary = `${buttonBase} h-10 border border-border-strong bg-transparent px-4 text-foreground hover:bg-surface-2`;

export const buttonGhost = `${buttonBase} h-10 px-3 text-muted hover:bg-surface-2 hover:text-foreground`;

/** Variante haute, réservée aux appels à l'action de la landing. */
export const buttonPrimaryLg = `${buttonBase} h-11 bg-accent px-5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-accent-hover`;

export const buttonSecondaryLg = `${buttonBase} h-11 border border-border-strong px-5 text-sm text-foreground hover:bg-surface-2`;

/* --------------------------------------------------------------------------
   Champs de formulaire
   -------------------------------------------------------------------------- */

export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface-2 px-3.5 text-[13.5px] text-foreground placeholder:text-faint transition-colors hover:border-border-strong focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent/25";

type FieldProps = {
  label: string;
  hint?: string;
  children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

/** Libellé + champ texte, avec indication optionnelle. */
export function Field({ label, hint, children, ...inputProps }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
      </span>
      {children ?? <input className={inputClass} {...inputProps} />}
    </label>
  );
}

/* --------------------------------------------------------------------------
   Messages d'état
   -------------------------------------------------------------------------- */

type AlertProps = {
  tone: "error" | "success";
  children: ReactNode;
};

export function Alert({ tone, children }: AlertProps) {
  const styles =
    tone === "error"
      ? "border-danger/25 bg-danger-soft text-danger"
      : "border-success/25 bg-success-soft text-success";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${styles}`}
    >
      {children}
    </p>
  );
}

/* --------------------------------------------------------------------------
   Conteneurs
   -------------------------------------------------------------------------- */

type PanelProps = {
  children: ReactNode;
  className?: string;
};

/** Bloc de contenu sur fond légèrement surélevé. */
export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface ${className}`}
    >
      {children}
    </section>
  );
}

type PanelHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PanelHeader({ title, description, action }: PanelHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** En-tête de page : titre + sous-titre. */
export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-9">
      <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-foreground">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          {description}
        </p>
      )}
    </header>
  );
}
