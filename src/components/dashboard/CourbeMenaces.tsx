"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PointJour = {
  /** Clé de jour locale, « 2026-08-15 » */
  jour: string;
  /** Libellé court affiché sous l'axe, « 15 août » */
  label: string;
  /** Libellé long, pour l'infobulle et la table accessible */
  labelLong: string;
  valeur: number;
};

/* --------------------------------------------------------------------------
   Géométrie
   -------------------------------------------------------------------------- */

const HAUTEUR = 190;
const MARGE = { haut: 14, bas: 26, gauche: 30, droite: 12 };

/**
 * Interpolation cubique monotone (Fritsch–Carlson).
 * Une spline cardinale classique dépasserait sous la ligne de base sur les
 * creux — donc afficherait des valeurs négatives sur un comptage. La variante
 * monotone garantit que la courbe reste dans l'enveloppe des points.
 */
function cheminMonotone(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;

  // Pentes des segments
  const pentes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    pentes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  // Tangente en chaque point, bridée pour rester monotone
  const tangentes: number[] = new Array(n);
  tangentes[0] = pentes[0];
  tangentes[n - 1] = pentes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (pentes[i - 1] * pentes[i] <= 0) {
      tangentes[i] = 0; // extremum local : tangente horizontale
    } else {
      tangentes[i] = (pentes[i - 1] + pentes[i]) / 2;
      const limite = 3 * Math.min(Math.abs(pentes[i - 1]), Math.abs(pentes[i]));
      if (Math.abs(tangentes[i]) > limite) {
        tangentes[i] = Math.sign(tangentes[i]) * limite;
      }
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const c1x = points[i].x + dx / 3;
    const c1y = points[i].y + (tangentes[i] * dx) / 3;
    const c2x = points[i + 1].x - dx / 3;
    const c2y = points[i + 1].y - (tangentes[i + 1] * dx) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return d;
}

/* --------------------------------------------------------------------------
   Composant
   -------------------------------------------------------------------------- */

type Props = {
  points: PointJour[];
};

/**
 * Courbe du nombre d'alertes par jour.
 *
 * Série unique : pas de légende, le titre du panneau nomme la donnée. Aucune
 * valeur n'est écrite sur les points — seul le maximum est étiqueté ; le
 * détail se lit au survol, et une table masquée porte les mêmes chiffres pour
 * les lecteurs d'écran.
 */
export function CourbeMenaces({ points }: Props) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const [largeur, setLargeur] = useState(720);
  const [survole, setSurvole] = useState<number | null>(null);

  // La géométrie se calcule en pixels : on suit la largeur réelle du panneau
  // plutôt que d'étirer un viewBox, ce qui déformerait les traits.
  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const observateur = new ResizeObserver(([entree]) => {
      setLargeur(Math.max(240, entree.contentRect.width));
    });
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  const geometrie = useMemo(() => {
    const largeurTrace = Math.max(1, largeur - MARGE.gauche - MARGE.droite);
    const hauteurTrace = HAUTEUR - MARGE.haut - MARGE.bas;

    // Échelle : au moins 1 pour qu'une série vide garde un axe lisible,
    // arrondie vers le haut pour des graduations entières.
    const maxBrut = points.reduce((m, p) => Math.max(m, p.valeur), 0);
    const max = Math.max(1, maxBrut);

    const coords = points.map((p, i) => ({
      x:
        MARGE.gauche +
        (points.length === 1
          ? largeurTrace / 2
          : (i * largeurTrace) / (points.length - 1)),
      y: MARGE.haut + hauteurTrace * (1 - p.valeur / max),
    }));

    const ligne = cheminMonotone(coords);
    const aire =
      coords.length >= 2
        ? `${ligne} L ${coords[coords.length - 1].x} ${MARGE.haut + hauteurTrace} L ${coords[0].x} ${MARGE.haut + hauteurTrace} Z`
        : "";

    return { coords, ligne, aire, max, maxBrut, largeurTrace, hauteurTrace };
  }, [points, largeur]);

  /** Index du point le plus proche du curseur. */
  const surDeplacement = useCallback(
    (evenement: React.MouseEvent<SVGRectElement>) => {
      if (geometrie.coords.length === 0) return;
      const boite = evenement.currentTarget.getBoundingClientRect();
      const x = evenement.clientX - boite.left;
      let proche = 0;
      let ecart = Infinity;
      geometrie.coords.forEach((c, i) => {
        const d = Math.abs(c.x - x);
        if (d < ecart) {
          ecart = d;
          proche = i;
        }
      });
      setSurvole(proche);
    },
    [geometrie.coords],
  );

  if (points.length === 0) {
    return (
      <p className="py-14 text-center text-[13px] text-muted">
        Aucune alerte sur cette période.
      </p>
    );
  }

  // Étiquettes d'axe : au plus 5, réparties régulièrement
  const pas = Math.max(1, Math.ceil(points.length / 5));
  const actif = survole !== null ? points[survole] : null;
  const coordActive = survole !== null ? geometrie.coords[survole] : null;

  // Position de l'infobulle, recentrée près des bords
  const tooltipGauche = coordActive
    ? Math.min(Math.max(coordActive.x, 62), largeur - 62)
    : 0;

  return (
    <div ref={conteneur} className="relative w-full">
      <svg
        width={largeur}
        height={HAUTEUR}
        className="block overflow-visible"
        role="img"
        aria-label={`Nombre d'alertes par jour, ${points.length} jours, maximum ${geometrie.maxBrut}`}
      >
        <defs>
          <linearGradient id="courbe-menaces-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-text)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent-text)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Graduations horizontales — volontairement effacées */}
        {[0, 0.5, 1].map((t) => {
          const y = MARGE.haut + geometrie.hauteurTrace * t;
          const valeur = Math.round(geometrie.max * (1 - t));
          return (
            <g key={t}>
              <line
                x1={MARGE.gauche}
                x2={largeur - MARGE.droite}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                className="text-white/[0.055]"
              />
              <text
                x={MARGE.gauche - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-current text-[10px] text-faint"
              >
                {valeur}
              </text>
            </g>
          );
        })}

        {/* Aire puis ligne */}
        {geometrie.aire && (
          <path d={geometrie.aire} fill="url(#courbe-menaces-aire)" />
        )}
        <path
          d={geometrie.ligne}
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Repère vertical et point actif */}
        {coordActive && (
          <>
            <line
              x1={coordActive.x}
              x2={coordActive.x}
              y1={MARGE.haut}
              y2={MARGE.haut + geometrie.hauteurTrace}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
              className="text-white/20"
            />
            <circle
              cx={coordActive.x}
              cy={coordActive.y}
              r="5"
              fill="var(--accent-text)"
              stroke="var(--surface)"
              strokeWidth="2.5"
            />
          </>
        )}

        {/* Étiquettes de dates */}
        {points.map((p, i) =>
          i % pas === 0 || i === points.length - 1 ? (
            <text
              key={p.jour}
              x={geometrie.coords[i].x}
              y={HAUTEUR - 8}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
              className="fill-current text-[10px] text-faint"
            >
              {p.label}
            </text>
          ) : null,
        )}

        {/* Zone de capture du survol, plus large que les marques */}
        <rect
          x={0}
          y={0}
          width={largeur}
          height={HAUTEUR}
          fill="transparent"
          onMouseMove={surDeplacement}
          onMouseLeave={() => setSurvole(null)}
        />
      </svg>

      {/* Infobulle */}
      {actif && coordActive && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border-strong bg-surface-3 px-2.5 py-1.5 shadow-lg"
          style={{ left: tooltipGauche, top: Math.max(0, coordActive.y - 52) }}
        >
          <p className="whitespace-nowrap text-[11px] text-muted">
            {actif.labelLong}
          </p>
          <p className="tabular whitespace-nowrap text-[13px] font-semibold text-foreground">
            {actif.valeur} {actif.valeur > 1 ? "alertes" : "alerte"}
          </p>
        </div>
      )}

      {/* Même donnée, lisible par les technologies d'assistance */}
      <table className="sr-only">
        <caption>Nombre d&apos;alertes détectées par jour</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Alertes</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.jour}>
              <th scope="row">{p.labelLong}</th>
              <td>{p.valeur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
