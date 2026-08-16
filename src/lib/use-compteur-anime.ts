"use client";

import { useEffect, useRef, useState } from "react";

/** Courbe d'assouplissement : départ franc, arrivée posée. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const DUREE_PAR_DEFAUT_MS = 900;

/**
 * Fait défiler une valeur de 0 jusqu'à `cible` au montage, et à chaque
 * changement de cible (utile quand un filtre de période recalcule le chiffre).
 *
 * Respecte `prefers-reduced-motion` : la valeur finale s'affiche alors
 * directement, dès la première image.
 */
export function useCompteurAnime(
  cible: number,
  dureeMs = DUREE_PAR_DEFAUT_MS,
): number {
  const [valeur, setValeur] = useState(0);
  const image = useRef<number | null>(null);

  useEffect(() => {
    const animationsReduites = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Durée nulle si l'animation n'a pas lieu d'être : la première image
    // affiche alors directement la valeur finale. Passer malgré tout par
    // requestAnimationFrame évite un setState synchrone dans l'effet.
    const duree = animationsReduites || cible === 0 ? 0 : dureeMs;
    const depart = performance.now();

    const avancer = (maintenant: number) => {
      const progression =
        duree === 0 ? 1 : Math.min((maintenant - depart) / duree, 1);
      setValeur(Math.round(easeOutCubic(progression) * cible));
      if (progression < 1) {
        image.current = requestAnimationFrame(avancer);
      }
    };

    image.current = requestAnimationFrame(avancer);
    return () => {
      if (image.current !== null) cancelAnimationFrame(image.current);
    };
  }, [cible, dureeMs]);

  return valeur;
}
