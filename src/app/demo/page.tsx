import type { Metadata } from "next";
import Link from "next/link";
import { DemoRequestForm } from "@/components/DemoRequestForm";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { IconTarget, IconFormation, IconShieldCheck } from "@/components/icons";
import { OFFRES } from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Demander une démo — Safentreprise",
  description:
    "Trente minutes pour voir comment Safentreprise teste, forme et protège vos équipes face à l'arnaque au président.",
};

/** Ce que couvre la démonstration — reprend le triptyque de la landing. */
const PROGRAMME = [
  {
    cle: "tester",
    Icone: IconTarget,
    titre: "Une simulation sur votre contexte",
    texte:
      "Nous montons un scénario avec vos noms de dirigeants et vos circuits de validation.",
  },
  {
    cle: "former",
    Icone: IconFormation,
    titre: "Le parcours de formation",
    texte:
      "Ce que reçoit un collaborateur qui clique, et comment se mesure sa progression.",
  },
  {
    cle: "proteger",
    Icone: IconShieldCheck,
    titre: "L'extension en fonctionnement",
    texte:
      "La bannière d'alerte déclenchée en direct sur un message d'usurpation.",
  },
];

/** Page publique de prise de contact commercial. */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ offre?: string }>;
}) {
  // Depuis /tarifs, le bouton transmet l'offre choisie : on la reprend pour
  // pré-remplir le message. Valeur inconnue = paramètre ignoré.
  const { offre } = await searchParams;
  const offreChoisie = OFFRES.find((o) => o.cle === offre)?.nom;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 lg:px-8">
          <Link href="/" aria-label="Safentreprise — accueil">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-[13.5px] text-muted transition-colors hover:text-foreground"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="relative isolate flex-1 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="top-glow absolute inset-x-0 top-0 h-[420px]" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:gap-16">
            {/* Argumentaire */}
            <div>
              <p>
                <span className="eyebrow">Démonstration accompagnée</span>
              </p>

              <h1 className="mt-5 max-w-lg text-[clamp(1.9rem,4vw,2.9rem)] font-extrabold leading-[1.1] text-foreground">
                Voyez Safentreprise sur vos propres cas
              </h1>

              <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-muted">
                Trente minutes en visioconférence, sans engagement. Nous
                partons de votre organisation — vos équipes comptables, vos
                procédures de virement — et vous montrons les trois temps du
                dispositif.
              </p>

              <ul className="mt-10 space-y-7">
                {PROGRAMME.map((item) => (
                  <li key={item.cle} className="flex gap-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                      <item.Icone />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-bold text-foreground">
                        {item.titre}
                      </h2>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                        {item.texte}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-10 text-[13px] text-faint">
                Vous préférez essayer par vous-même ?{" "}
                <Link
                  href="/signup"
                  className="text-muted underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Créer un compte
                </Link>
              </p>
            </div>

            {/* Formulaire */}
            <div className="lg:pt-2">
              <DemoRequestForm offre={offreChoisie} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Logo />
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
