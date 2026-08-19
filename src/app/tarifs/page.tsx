import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";
import {
  ABONNEMENT,
  AFFICHER_LES_PRIX,
  AUDIT_INITIAL,
  CONDITIONS,
  OFFRES,
  type Offre,
  type Prestation,
  formaterEuros,
} from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Tarifs — Safentreprise",
  description:
    "Trois offres selon l’effectif : audit initial d’exposition à la fraude puis abonnement de protection continue. Devis sur demande.",
  robots: { index: true, follow: true },
};

export default function TarifsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 lg:px-8">
          <Link href="/" aria-label="Safentreprise — accueil">
            <Logo />
          </Link>
          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              className="hidden h-9 items-center px-3 text-[13.5px] text-muted transition-colors hover:text-foreground sm:inline-flex"
            >
              Retour à l&apos;accueil
            </Link>
            <Link href="/demo" className={buttonPrimary}>
              Demander un devis
            </Link>
          </div>
        </div>
      </header>

      <main className="relative isolate flex-1 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="top-glow absolute inset-x-0 top-0 h-[420px]" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20 lg:px-8">
          {/* En-tête */}
          <div className="max-w-2xl">
            <p>
              <span className="eyebrow">Tarifs</span>
            </p>
            <h1 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-foreground">
              Un audit pour mesurer, un abonnement pour tenir
            </h1>
            <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
              Le dispositif se met en place en deux temps : un audit initial
              d&apos;exposition à la fraude, facturé une fois au démarrage, puis
              un abonnement forfaitaire qui couvre la protection continue.
              L&apos;offre est déterminée par votre effectif — pas par le nombre
              de comptes ouverts.
            </p>
          </div>

          {/* Les trois offres */}
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {OFFRES.map((offre) => (
              <CarteOffre key={offre.cle} offre={offre} />
            ))}
          </div>

          <p className="mt-6 text-[13px] leading-relaxed text-faint">
            Au-delà de 200 collaborateurs, l&apos;offre est construite sur
            mesure. Prix hors taxes — TVA non applicable, article 293 B du Code
            général des impôts.
          </p>

          {/* Contenu des deux composantes */}
          <div className="mt-20 grid gap-5 lg:grid-cols-2">
            <BlocPrestations
              surtitre="Une fois, au démarrage"
              titre="Ce que comprend l’audit initial"
              chapeau="Le rapport remis au dirigeant est le cœur du livrable."
              prestations={AUDIT_INITIAL}
            />
            <BlocPrestations
              surtitre="Chaque mois, ensuite"
              titre="Ce que comprend l’abonnement"
              chapeau="Identique dans les trois offres : seul l’effectif couvert change."
              prestations={ABONNEMENT}
            />
          </div>

          {/* Conditions commerciales */}
          <section className="mt-20">
            <h2 className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-extrabold leading-tight tracking-[-0.025em] text-foreground">
              Conditions commerciales
            </h2>

            <dl className="mt-8 grid gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-2">
              {CONDITIONS.map((condition) => (
                <div key={condition.titre} className="bg-surface px-6 py-5">
                  <dt className="text-[14px] font-bold text-foreground">
                    {condition.titre}
                  </dt>
                  <dd className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                    {condition.precision}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-5 text-[13px] leading-relaxed text-faint">
              Le détail contractuel figure dans les{" "}
              <Link
                href="/cgv"
                className="text-muted underline underline-offset-4 transition-colors hover:text-foreground"
              >
                conditions générales de vente
              </Link>
              .
            </p>
          </section>

          {/* Appel à l'action */}
          <section className="mt-20 rounded-[14px] border border-border bg-surface px-8 py-12 text-center">
            <h2 className="mx-auto max-w-lg text-[clamp(1.5rem,2.6vw,2.05rem)] font-extrabold leading-tight tracking-[-0.025em] text-foreground">
              Parlons de votre organisation
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-muted">
              Trente minutes suffisent pour cerner votre exposition et vous
              adresser une proposition chiffrée.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/demo" className={buttonPrimary}>
                Demander un devis
                <IconArrowRight />
              </Link>
              <a
                href="mailto:contact@safentreprise.com"
                className={buttonSecondary}
              >
                contact@safentreprise.com
              </a>
            </div>
          </section>
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

/**
 * Carte d'une offre.
 *
 * Le bloc de prix est le seul endroit à connaître AFFICHER_LES_PRIX : quand
 * la grille sera publiée, la carte affichera les montants sans autre
 * modification de la page.
 */
function CarteOffre({ offre }: { offre: Offre }) {
  const enAvant = offre.miseEnAvant;

  return (
    <article
      className={`relative flex flex-col rounded-[12px] border bg-surface px-6 py-7 ${
        enAvant ? "border-accent-line" : "border-border"
      }`}
    >
      {enAvant && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white">
          Recommandé
        </span>
      )}

      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-foreground">
        {offre.nom}
      </h2>
      <p className="mt-1.5 text-[13px] font-medium text-accent-text">
        {offre.effectif}
      </p>

      <div className="mt-6 border-y border-border py-5">
        <Prix offre={offre} />
      </div>

      <p className="mt-5 flex-1 text-[13.5px] leading-relaxed text-muted">
        {offre.argument}
      </p>

      <Link
        href={`/demo?offre=${offre.cle}`}
        className={`${enAvant ? buttonPrimary : buttonSecondary} mt-7 w-full`}
      >
        Demander un devis
      </Link>
    </article>
  );
}

/** Montants si la grille est publiée, « Sur devis » sinon. */
function Prix({ offre }: { offre: Offre }) {
  if (!AFFICHER_LES_PRIX || !offre.prix) {
    return (
      <>
        <p className="text-[24px] font-extrabold tracking-[-0.03em] text-foreground">
          Sur devis
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-faint">
          Proposition chiffrée après un premier échange.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-[24px] font-extrabold tracking-[-0.03em] text-foreground">
        {formaterEuros(offre.prix.abonnementMensuel)}
        <span className="ml-1 text-[13px] font-medium text-muted">/ mois</span>
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-faint">
        Audit initial : {formaterEuros(offre.prix.auditInitial)}, facturé une
        fois au démarrage. Montants hors taxes.
      </p>
    </>
  );
}

/** Colonne « ce que comprend… » : liste cochée. */
function BlocPrestations({
  surtitre,
  titre,
  chapeau,
  prestations,
}: {
  surtitre: string;
  titre: string;
  chapeau: string;
  prestations: Prestation[];
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface px-6 py-7">
      <p>
        <span className="eyebrow">{surtitre}</span>
      </p>
      <h2 className="mt-4 text-[18px] font-bold tracking-[-0.02em] text-foreground">
        {titre}
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{chapeau}</p>

      <ul className="mt-6 space-y-3.5">
        {prestations.map((prestation) => (
          <li key={prestation.titre} className="flex gap-3">
            <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <IconCheck className="h-3 w-3" />
            </span>
            <p className="text-[13.5px] leading-relaxed text-muted">
              <span className="font-semibold text-foreground">
                {prestation.titre}
              </span>
              {prestation.precision && <> — {prestation.precision}</>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
