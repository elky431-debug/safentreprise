import Link from "next/link";

/**
 * Ligne de liens légaux, reprise dans tous les pieds de page :
 * landing, page de démonstration, pages légales et espace connecté.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint ${className}`}
    >
      <Link
        href="/mentions-legales"
        className="transition-colors hover:text-foreground"
      >
        Mentions légales
      </Link>
      <span aria-hidden>·</span>
      <Link
        href="/politique-de-confidentialite"
        className="transition-colors hover:text-foreground"
      >
        Politique de confidentialité
      </Link>
      <span aria-hidden>·</span>
      <span>© 2026 Safentreprise</span>
    </p>
  );
}
