import type { ReactNode } from "react";

/**
 * Composants de mise en forme des pages légales.
 *
 * Le projet n'embarque pas de plugin typographique Tailwind : ces primitives
 * tiennent lieu de « prose », avec des tailles plus généreuses que celles de
 * l'application, faites pour de la lecture suivie et non pour du pilotage.
 */

/** Titre de section. L'identifiant permet un lien direct depuis un sommaire. */
export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 scroll-mt-24 text-[19px] font-semibold leading-snug tracking-[-0.025em] text-foreground first:mt-0"
    >
      {children}
    </h2>
  );
}

/** Sous-titre : niveau 1.1, 2.3… */
export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mt-9 scroll-mt-24 text-[15.5px] font-semibold tracking-[-0.015em] text-foreground"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[15px] leading-[1.75] text-muted">{children}</p>
  );
}

/** Mise en avant d'un terme dans le corps du texte. */
export function Fort({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 space-y-2.5 text-[15px] leading-[1.75] text-muted">
      {children}
    </ul>
  );
}

export function Li({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5">
      <span
        aria-hidden
        className="absolute left-0 top-[0.7em] h-1 w-1 rounded-full bg-accent-text"
      />
      {children}
    </li>
  );
}

/** Bloc de coordonnées : lignes courtes, sans puces. */
export function Coordonnees({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-border bg-surface px-5 py-4 text-[14.5px] leading-[1.7] text-muted">
      {children}
    </div>
  );
}

/**
 * Encadré d'attention : filet coloré à gauche, fond légèrement contrasté.
 * Réservé aux points dont l'omission fait courir un risque au lecteur.
 */
export function Encadre({
  titre,
  children,
}: {
  titre: string;
  children: ReactNode;
}) {
  return (
    <aside className="mt-7 rounded-xl border border-warning/25 border-l-[3px] border-l-warning bg-warning-soft px-5 py-4">
      <p className="text-[14px] font-semibold text-warning">{titre}</p>
      <p className="mt-2 text-[14.5px] leading-[1.7] text-muted">{children}</p>
    </aside>
  );
}

/**
 * Tableau responsive : le défilement horizontal reste dans le conteneur,
 * la page ne défile jamais latéralement.
 */
export function Tableau({
  entetes,
  lignes,
}: {
  entetes: string[];
  lignes: ReactNode[][];
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-2/50">
            {entetes.map((entete) => (
              <th
                key={entete}
                scope="col"
                className="px-4 py-3 text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint"
              >
                {entete}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, index) => (
            <tr
              key={index}
              className="border-b border-border bg-surface last:border-0"
            >
              {ligne.map((cellule, colonne) => (
                <td
                  key={colonne}
                  className={`px-4 py-3.5 align-top text-[13.5px] leading-relaxed ${
                    colonne === 0 ? "text-foreground" : "text-muted"
                  }`}
                >
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lien sortant, souligné discrètement. */
export function LienExterne({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-text underline decoration-accent-line underline-offset-[3px] transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}
