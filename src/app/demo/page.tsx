import type { Metadata } from "next";
import Link from "next/link";
import { DemoRequestForm } from "@/components/DemoRequestForm";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { OFFRES } from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Demander une démo — Safentreprise",
  description:
    "Trente minutes pour voir comment Safentreprise repère la fraude au président, au fournisseur et à la facture dans vos messageries.",
};

/** Ce que couvre la démonstration. */
const PROGRAMME = [
  {
    cle: "contexte",
    titre: "Une simulation sur votre contexte",
    texte:
      "Nous montons un scénario avec vos noms de dirigeants et vos circuits de validation, pas avec un exemple générique.",
  },
  {
    cle: "perimetre",
    titre: "Le périmètre d’accès, en clair",
    texte:
      "Quelles boîtes sont surveillées, comment votre administrateur le décide, et comment la restriction se vérifie.",
  },
  {
    cle: "alerte",
    titre: "L’avertissement en fonctionnement",
    texte:
      "Ce que voit un collaborateur quand un message porte les signes d’une tentative de fraude, sur ordinateur comme sur mobile.",
  },
];

/** Page publique de prise de contact commercial. */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ offre?: string }>;
}) {
  // Depuis /tarifs, le bouton transmet l'offre choisie : on la reprend pour
  // pré-remplir le besoin. Valeur inconnue = paramètre ignoré.
  const { offre } = await searchParams;
  const offreChoisie = OFFRES.find((o) => o.cle === offre)?.nom;

  return (
    <div className="theme-clair flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6 lg:px-8">
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

      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
            {/* Argumentaire */}
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
                Démonstration
              </p>

              <h1 className="mt-7 max-w-lg text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground">
                Voyez Safentreprise sur vos propres cas
              </h1>

              <ul className="mt-12 space-y-9">
                {PROGRAMME.map((item) => (
                  <li key={item.cle} className="max-w-md">
                    <h2 className="text-[15.5px] font-semibold text-foreground">
                      {item.titre}
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted">
                      {item.texte}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Formulaire */}
            <div>
              <DemoRequestForm offre={offreChoisie} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <Logo />
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
