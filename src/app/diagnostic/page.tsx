import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { buttonPrimaryLg, buttonSecondaryLg } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * Le diagnostic gratuit — page d'attente.
 *
 * ⚠ ELLE EXISTE POUR QU'UN LIEN DE LA VITRINE NE SOIT PAS MORT. Le bloc
 *   « Notre équipe » du hero pointe ici ; sans cette page, un visiteur qui
 *   clique tombe sur une 404. Sur un produit qui vend la confiance, une 404
 *   depuis la page d'accueil coûte plus cher qu'une page d'attente honnête.
 *
 * ⚠ ELLE NE PROMET PAS DE DATE. « Bientôt disponible » n'engage à rien ;
 *   annoncer un mois qu'on ne tiendrait pas serait pire que le silence. Et
 *   elle ne collecte aucune adresse : un formulaire « prévenez-moi » sans
 *   traitement derrière serait une collecte sans finalité.
 *
 *   Elle renvoie donc vers ce qui EXISTE : la démonstration.
 */
export const metadata: Metadata = {
  title: "Diagnostic gratuit — Safentreprise",
  description:
    "Le diagnostic gratuit de votre exposition à la fraude au virement arrive prochainement.",
  // Une page d'attente n'a rien à faire dans un index de recherche : elle
  // capterait des visiteurs pour leur montrer une absence.
  robots: { index: false, follow: true },
};

export default function DiagnosticPage() {
  return (
    <div className="theme-clair flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Safentreprise — accueil">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-[13.5px] text-muted transition-colors hover:text-foreground"
          >
            Retour à l’accueil
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center px-6 py-20">
        <div className="mx-auto max-w-[620px] text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
            Bientôt disponible
          </p>

          <h1 className="mt-7 text-[clamp(1.7rem,3.4vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-balance text-foreground">
            Le diagnostic gratuit arrive.
          </h1>

          <p className="mx-auto mt-5 max-w-[54ch] text-[16.5px] leading-relaxed text-muted">
            Il mesurera l’exposition de votre entreprise à la fraude au
            virement&nbsp;: domaines proches du vôtre déjà déposés, dirigeants
            exposés publiquement, et points d’entrée les plus probables. Nous le
            mettons au point.
          </p>

          <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-relaxed text-muted">
            En attendant, une démonstration de vingt minutes montre exactement
            ce que Safentreprise détecte dans une messagerie réelle.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/demo" className={buttonPrimaryLg}>
              Demander une démo
              <IconArrowRight />
            </Link>
            <Link href="/tarifs" className={buttonSecondaryLg}>
              Voir les tarifs
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
