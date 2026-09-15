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
  /**
   * Ventilation du jour par niveau de risque.
   *
   * ⚠ C'EST CE QUI REND LA COURBE LISIBLE. Un pic sans ventilation ne dit pas
   *   si la journée a été mauvaise ou simplement bavarde : vingt alertes
   *   faibles et vingt alertes élevées dessinent exactement le même sommet.
   */
  parNiveau: { eleve: number; modere: number; faible: number };
};

/**
 * Les trois niveaux, dans l'ordre de gravité, avec leur teinte.
 *
 * ⚠ C'EST LE SEUL ENDROIT DE CE FICHIER OÙ LA COULEUR EST PERMISE. Elle y
 *   qualifie un niveau de risque, ce qui est sa seule raison d'être dans
 *   l'espace connecté.
 */
const NIVEAUX_INFOBULLE = [
  { cle: "eleve", label: "Élevé", point: "pastille-eleve" },
  { cle: "modere", label: "Modéré", point: "pastille-modere" },
  { cle: "faible", label: "Faible", point: "pastille-faible" },
] as const;

/**
 * Ordonnée de l'infobulle.
 *
 * ⚠ ELLE BASCULE SOUS LE POINT PLUTÔT QUE DE LE RECOUVRIR. Posée au-dessus et
 *   simplement bornée à zéro, elle masquait le point actif sur les pics les
 *   plus hauts — c'est-à-dire exactement sur les journées qu'on vient regarder.
 */
function tooltipHaut(y: number, valeur: number): number {
  const hauteur = valeur > 0 ? 96 : 56;
  return y - hauteur < 0 ? y + 16 : y - hauteur;
}

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

    // ⚠ PLUS DE CHEMIN D'AIRE. Il fermait la courbe vers la ligne de base pour
    //   la remplir d'un dégradé ; le remplissage est supprimé, et garder le
    //   calcul laisserait une géométrie morte que quelqu'un rebrancherait.
    const ligne = cheminMonotone(coords);

    return { coords, ligne, max, maxBrut, largeurTrace, hauteurTrace };
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
        {/* ⚠ LA COURBE EST EN ENCRE, PLUS EN BLEU DE MARQUE. Dans l'espace
            connecté, la couleur est réservée au NIVEAU DE RISQUE : rouge pour
            élevé, ambre pour modéré, gris pour faible. Un tracé bleu ne
            désignait rien — il décorait, et il faisait de l'écran un tableau de
            bord de croissance de plus. Le seul endroit où la couleur reparaît
            ici, c'est l'infobulle, où elle qualifie bien un niveau.

            ⚠ PLUS DE `<defs>` NON PLUS. Le dégradé sous la courbe figure dans
              la liste des suppressions : l'aire a été retirée, et la définition
              du dégradé restait derrière elle sans plus rien à peindre. */}

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
                className="text-border"
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

        <path
          d={geometrie.ligne}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
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
              className="text-border-strong"
            />
            <circle
              cx={coordActive.x}
              cy={coordActive.y}
              r="4.5"
              fill="var(--foreground)"
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

      {/* Infobulle — le jour, le total, puis la ventilation par niveau.
          ⚠ LES NIVEAUX À ZÉRO NE SONT PAS AFFICHÉS. Une journée à trois alertes
            faibles ne doit pas faire lire deux lignes vides avant de le dire. */}
      {actif && coordActive && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 border border-border-strong bg-surface px-3 py-2"
          style={{
            left: tooltipGauche,
            top: tooltipHaut(coordActive.y, actif.valeur),
            borderRadius: 4,
            boxShadow: "0 8px 24px -14px rgba(16, 20, 26, 0.4)",
          }}
        >
          <p className="texte-second whitespace-nowrap">{actif.labelLong}</p>
          <p className="chiffre whitespace-nowrap text-[15px] text-foreground">
            {actif.valeur}{" "}
            {actif.valeur > 1 ? "tentatives" : "tentative"}
          </p>

          {actif.valeur > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {NIVEAUX_INFOBULLE.map(({ cle, label, point }) =>
                actif.parNiveau[cle] > 0 ? (
                  <li
                    key={cle}
                    className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px]"
                  >
                    <span className={`pastille ${point}`}>{label}</span>
                    <span className="chiffre ml-auto pl-3 text-foreground">
                      {actif.parNiveau[cle]}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>
      )}

      {/* Même donnée, lisible par les technologies d'assistance */}
      {/* ⚠ L'ENVELOPPE PORTE `sr-only`, PAS LA TABLE, ET C'EST UN CORRECTIF.
          Posée sur le `<table>` lui-même, la classe ne l'empêchait pas
          d'élargir le document : un tableau s'étend pour tenir son contenu, et
          ses cinq colonnes ajoutaient 10 px de défilement horizontal en
          mobile — mesuré à 390 px de large. Sur un `<div>` absolu d'un pixel,
          `overflow: hidden` clippe réellement. */}
      <div className="sr-only">
      <table>
        <caption>Tentatives détectées par jour, réparties par niveau</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Total</th>
            <th scope="col">Élevé</th>
            <th scope="col">Modéré</th>
            <th scope="col">Faible</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.jour}>
              <th scope="row">{p.labelLong}</th>
              <td>{p.valeur}</td>
              <td>{p.parNiveau.eleve}</td>
              <td>{p.parNiveau.modere}</td>
              <td>{p.parNiveau.faible}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
