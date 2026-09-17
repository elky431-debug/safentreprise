import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { DiagnosticParcours } from "@/components/DiagnosticParcours";

/**
 * Le diagnostic gratuit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ PAS DE BARRE DE NAVIGATION COMPLÈTE, ET C'EST VOULU. Le parcours demande
 *   huit réponses d'affilée ; lui coller les six liens du menu à côté, c'est
 *   inviter à partir avant la deuxième question. Il reste le logo (retour à
 *   l'accueil) et rien d'autre — la sortie existe, elle n'est pas mise en
 *   avant.
 *
 * ⚠ CETTE PAGE EST INDEXABLE, CONTRAIREMENT À LA PAGE D'ATTENTE QU'ELLE
 *   REMPLACE. Elle a maintenant quelque chose à montrer.
 *
 * ⚠ LE PARCOURS EST UN COMPOSANT CLIENT, LA PAGE RESTE SERVEUR. Seul le
 *   questionnaire a besoin d'état ; l'en-tête, le pied de page et les
 *   métadonnées restent rendus côté serveur.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const metadata: Metadata = {
  title: "Diagnostic gratuit — Safentreprise",
  description:
    "Huit questions pour mesurer l’exposition de votre entreprise à la fraude au virement : circuit de validation, vérification des changements de RIB, exposition des dirigeants, protection du domaine. Résultat immédiat, sans inscription.",
};

export default function DiagnosticPage() {
  return (
    <div className="canevas-app vitrine theme-clair flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Safentreprise — accueil">
            <Logo />
          </Link>
          {/* Masquée sous 640 px : sur un téléphone, elle se replie sur deux
              lignes et écrase le logo pour ne rien dire de plus que le titre
              de la première question. */}
          <p className="hidden text-[12.5px] text-faint sm:block">
            Diagnostic d’exposition&nbsp;— gratuit, sans inscription
          </p>
        </div>
      </header>

      <main className="flex-1">
        <DiagnosticParcours />
      </main>

      <footer className="border-t border-border">
        {/* `LegalLinks` porte déjà la mention de copyright : en ajouter une
            ici la ferait apparaître deux fois. */}
        <div className="mx-auto max-w-[760px] px-6 py-6">
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
