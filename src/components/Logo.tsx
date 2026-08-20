import Image from "next/image";

type Props = {
  compact?: boolean;
  className?: string;
};

/**
 * Emblème officiel (PNG source, motif inchangé).
 * Fond transparent pour fond sombre ou clair.
 */
export function LogoEmblem({
  size = 96,
  className = "",
}: {
  size?: number;
  className?: string;
  /** Conservé pour compatibilité d'appel (anciens SVG multi-instances). */
  id?: string;
}) {
  return (
    <Image
      src="/logo-safentreprise.png"
      alt="Safentreprise"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      priority
    />
  );
}

/**
 * Petite marque (sidebar, en-têtes) — même PNG source, taille réduite.
 */
export function LogoMark({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo-safentreprise.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      aria-hidden
    />
  );
}

/**
 * Logo courant de l'application : emblème PNG + nom (sauf mode compact).
 */
export function Logo({ compact = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center">
        <LogoMark size={28} />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          Safentreprise
        </span>
      )}
    </span>
  );
}
