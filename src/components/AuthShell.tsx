import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Écran scindé pour la connexion et l'inscription :
 * panneau de contexte à gauche, formulaire à droite.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de contexte */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface px-10 py-10 lg:flex xl:px-14">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="hairline-grid absolute inset-0" />
          <div className="top-glow absolute inset-x-0 top-0 h-80" />
        </div>

        <Link href="/" className="relative">
          <Logo />
        </Link>

        <div className="relative max-w-md">
          <p className="text-[24px] font-extrabold leading-snug tracking-[-0.035em] text-foreground xl:text-[28px]">
            La meilleure défense, c&apos;est un collaborateur qui a déjà vu
            l&apos;arnaque.
          </p>
        </div>

        <ul className="relative space-y-2.5">
          {["Simulez", "Mesurez", "Formez"].map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 text-[13px] text-muted"
            >
              <span className="h-px w-3.5 shrink-0 bg-accent-line" />
              {item}
            </li>
          ))}
        </ul>
      </aside>

      {/* Formulaire */}
      <main className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-[380px]">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>

          <div className="rise">
            <h1 className="text-[21px] font-semibold text-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {subtitle}
            </p>

            <div className="mt-8">{children}</div>

            <div className="mt-7 border-t border-border pt-5 text-[13px] text-muted">
              {footer}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
