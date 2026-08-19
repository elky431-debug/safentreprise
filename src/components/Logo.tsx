type Props = {
  compact?: boolean;
  className?: string;
};

/* --------------------------------------------------------------------------
   Identité visuelle
   --------------------------------------------------------------------------

   Deux déclinaisons d'une même forme — un bouclier dont le cœur est un « S »
   tracé comme le noyau d'une empreinte digitale :

   • LogoMark   — version simplifiée : bouclier + S, tracé d'une seule couleur
                  (currentColor). Petits formats : sidebar, en-têtes, PDF
                  d'attestation. Aucun dégradé, aucun aplat : elle reste
                  lisible en monochrome, y compris à l'impression noir et
                  blanc et en négatif.

   • LogoEmblem — version complète : bouclier plein en dégradé cyan → bleu,
                  crêtes d'empreinte et S détourés en blanc. Grands formats :
                  favicon, icône d'application, image sociale, accueil.

   Les deux partent du même squelette géométrique, à deux grilles près
   (24 pour la marque simplifiée, 64 pour l'emblème), pour que le passage de
   l'une à l'autre ne se voie pas.
   -------------------------------------------------------------------------- */

/** Contour du bouclier — grille 24. */
const BOUCLIER_24 =
  "M12 2.4 20.4 5.5V12.2C20.4 17 16.9 21 12 22.2 7.1 21 3.6 17 3.6 12.2V5.5Z";

/** « S » central — grille 24. */
const S_24 =
  "M14.24 11.04C14.24 9.54 13.15 8.8 12 8.8c-1.22 0-2.24.74-2.24 1.92 0 1.31 1.15 1.76 2.24 2.08 1.09.32 2.24.77 2.24 2.08 0 1.18-1.02 1.92-2.24 1.92-1.31 0-2.24-.74-2.24-2.24";

/**
 * Marque simplifiée. Trace en `currentColor` : la couleur se règle depuis le
 * conteneur, ce qui permet de la poser sur n'importe quel fond sans variante.
 */
export function LogoMark({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d={BOUCLIER_24} />
      <path d={S_24} />
    </svg>
  );
}

/**
 * Emblème complet, réservé aux grands formats.
 * `id` distingue le dégradé si plusieurs emblèmes cohabitent sur une page.
 */
export function LogoEmblem({
  size = 96,
  className = "",
  id = "safentreprise-degrade",
}: {
  size?: number;
  className?: string;
  id?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Safentreprise"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={id} x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7ee8ef" />
          <stop offset="0.55" stopColor="#16a3b4" />
          <stop offset="1" stopColor="#1257a5" />
        </linearGradient>
      </defs>

      {/* Bouclier plein */}
      <path
        d="M32 3 57.5 12.2V32.5C57.5 45.6 47.3 55.9 32 61 16.7 55.9 6.5 45.6 6.5 32.5V12.2Z"
        fill={`url(#${id})`}
      />

      {/* Crêtes d'empreinte + noyau en S, détourés */}
      <g
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M14.78 25.97A19 19 0 0 1 49.22 25.97" strokeWidth={3} opacity={0.55} />
        <path d="M19.44 26.75A14.5 14.5 0 0 1 44.56 26.75" strokeWidth={3} opacity={0.8} />
        <path
          d="M39 30.5C39 25.8 35.6 23.5 32 23.5c-3.8 0-7 2.3-7 6 0 4.1 3.6 5.5 7 6.5 3.4 1 7 2.4 7 6.5 0 3.7-3.2 6-7 6-3.6 0-7-2.3-7-7"
          strokeWidth={3.6}
        />
      </g>
    </svg>
  );
}

/**
 * Logo courant de l'application : marque simplifiée dans sa pastille,
 * suivie du nom sauf en mode `compact`.
 */
export function Logo({ compact = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
        <LogoMark />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          Safentreprise
        </span>
      )}
    </span>
  );
}
