/**
 * Marque Safentreprise : monogramme géométrique (bouclier + trait de veille)
 * accompagné du nom. `compact` n'affiche que le monogramme.
 */
type Props = {
  compact?: boolean;
  className?: string;
};

export function Logo({ compact = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M12 2.5 20 5.6v6.2c0 4.6-3.2 8.5-8 9.7-4.8-1.2-8-5.1-8-9.7V5.6L12 2.5Z"
            stroke="var(--accent-text)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8.2 12.2h2.3l1.4-2.6 1.5 4 1.2-1.4h1.4"
            stroke="var(--accent-text)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          Safentreprise
        </span>
      )}
    </span>
  );
}
