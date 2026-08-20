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

/** Crêtes concentriques du bouclier, de l'extérieur vers l'intérieur. */
const CRETES = [
  "M 200 10 L 24 88 C 24 210, 58 366, 200 470 C 342 366, 376 210, 376 88 Z",
  "M 200 40 L 50 110 C 50 220, 80 358, 200 436 C 320 358, 350 220, 350 110 Z",
  "M 200 70 L 76 132 C 76 230, 102 350, 200 402 C 298 350, 324 230, 324 132 Z",
  "M 200 100 L 102 154 C 102 240, 124 342, 200 368 C 276 342, 298 240, 298 154 Z",
  "M 200 130 L 128 176 C 128 250, 146 334, 200 334 C 254 334, 272 250, 272 176 Z",
];

/** Noyau : le S. */
const S_EMBLEME =
  "M 240 202 C 240 184, 222 176, 200 176 L 184 176 C 160 176, 144 192, 144 214 C 144 232, 156 242, 176 248 L 224 264 C 246 271, 258 284, 258 306 C 258 330, 240 346, 214 346 L 196 346 C 172 346, 156 336, 156 316";

/**
 * Emblème complet, réservé aux grands formats.
 * `id` distingue le dégradé et le masque si plusieurs emblèmes cohabitent
 * sur une même page.
 */
export function LogoEmblem({
  size = 96,
  className = "",
  id = "safentreprise",
}: {
  size?: number;
  className?: string;
  id?: string;
}) {
  const degrade = `${id}-degrade`;
  const creux = `${id}-creux`;

  return (
    <svg
      width={size}
      height={size * (480 / 400)}
      viewBox="0 0 400 480"
      fill="none"
      role="img"
      aria-label="Safentreprise"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient
          id={degrade}
          x1="160"
          y1="0"
          x2="270"
          y2="470"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2BE6F4" />
          <stop offset="1" stopColor="#0C6CF3" />
        </linearGradient>

        {/* Le S creuse un couloir dans les crêtes : elles s'interrompent
            autour de lui au lieu de le traverser. */}
        <mask id={creux}>
          <rect x="0" y="0" width="400" height="480" fill="#fff" />
          <path
            d={S_EMBLEME}
            fill="none"
            stroke="#000"
            strokeWidth={56}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </mask>
      </defs>

      <g
        stroke={`url(#${degrade})`}
        fill="none"
        strokeWidth={15}
        strokeLinejoin="round"
        strokeLinecap="round"
        mask={`url(#${creux})`}
      >
        {CRETES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path
        d={S_EMBLEME}
        fill="none"
        stroke={`url(#${degrade})`}
        strokeWidth={26}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
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
