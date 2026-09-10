"use client";

import { useEffect, useRef } from "react";

/**
 * Bande de motifs défilants, entre le hero et les trois fraudes.
 *
 * Elle occupe l'emplacement où d'autres sites alignent des logos clients. Nous
 * n'en avons aucun à montrer : on y met ce que le produit repère réellement.
 *
 * ⚠ DÉCORATIVE POUR UN LECTEUR D'ÉCRAN — `aria-hidden`. Une bande qui défile
 *   en boucle est illisible à la synthèse vocale, et l'ordre de lecture d'un
 *   contenu en mouvement n'a pas de sens. Les mêmes motifs sont énoncés en
 *   clair plus bas, dans les sections « Trois fraudes » et « Protection ».
 *   ⚠ Si ces sections changeaient au point de ne plus les nommer, cette bande
 *     deviendrait une information réservée aux voyants : il faudrait alors la
 *     rendre lisible plutôt que de la masquer.
 *
 * ⚠ CE COMPOSANT N'EXISTE CÔTÉ CLIENT QUE POUR LE RALENTI AU SURVOL. Le reste
 *   — défilement, fondu, mouvement réduit — est en CSS pur et fonctionne sans
 *   JavaScript.
 */

/** Ce que le moteur sait repérer, dit en français d'utilisateur. */
const MOTIFS = [
  "Nom de l'annuaire, adresse extérieure",
  "Demande de virement",
  "Pression à l'urgence",
  "Changement de coordonnées bancaires",
  "Domaine ressemblant",
  "Messagerie grand public",
  "Demande de confidentialité",
  "Contournement des procédures",
];

/** Durée du ralenti et de la reprise, en millisecondes. */
const RALENTI_MS = 450;

export function BandeMotifs() {
  const bande = useRef<HTMLDivElement>(null);
  const piste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cadre = bande.current;
    const rail = piste.current;
    if (!cadre || !rail) return;

    // `getAnimations` donne la main sur l'animation CSS déjà en cours : on
    // ajuste sa vitesse sans la relancer, donc sans saut de position.
    // Absente (navigateur ancien), on laisse la règle CSS de repli agir.
    if (typeof rail.getAnimations !== "function") return;

    const animation = rail.getAnimations()[0];
    if (!animation) return;

    // Le mouvement réduit est déjà respecté par la CSS (`animation: none`) :
    // il n'y a alors aucune animation à piloter, et on ne force rien ici.
    cadre.dataset.anime = "js";

    let image = 0;
    let debut = 0;
    let depart = 1;

    const ramper = (vers: number) => {
      cancelAnimationFrame(image);
      debut = performance.now();
      depart = animation.playbackRate;

      const pas = (maintenant: number) => {
        const t = Math.min(1, (maintenant - debut) / RALENTI_MS);
        // Cubique sortante : le freinage est franc au début puis s'adoucit,
        // ce qui se lit comme un arrêt volontaire et non comme une saccade.
        const adouci = 1 - Math.pow(1 - t, 3);
        animation.playbackRate = depart + (vers - depart) * adouci;
        if (t < 1) image = requestAnimationFrame(pas);
      };

      image = requestAnimationFrame(pas);
    };

    const ralentir = () => ramper(0);
    const reprendre = () => ramper(1);

    cadre.addEventListener("pointerenter", ralentir);
    cadre.addEventListener("pointerleave", reprendre);
    // Un doigt qui quitte l'écran ne déclenche pas toujours `pointerleave` :
    // sans ce filet, la bande resterait arrêtée après un appui sur mobile.
    cadre.addEventListener("pointercancel", reprendre);

    return () => {
      cancelAnimationFrame(image);
      cadre.removeEventListener("pointerenter", ralentir);
      cadre.removeEventListener("pointerleave", reprendre);
      cadre.removeEventListener("pointercancel", reprendre);
      delete cadre.dataset.anime;
    };
  }, []);

  return (
    <section
      ref={bande}
      aria-hidden="true"
      className="bande-motifs sur-marine px-6 py-11 md:py-12 lg:px-8"
    >
      <p className="bande-motifs__intitule">Ce que Safentreprise repère</p>

      <div className="bande-motifs__cadre mt-7">
        <div ref={piste} className="bande-motifs__piste">
          <Serie />
          {/* La copie rend la boucle invisible : voir la note de globals.css. */}
          <Serie copie />
        </div>
      </div>
    </section>
  );
}

function Serie({ copie = false }: { copie?: boolean }) {
  return (
    <ul className="bande-motifs__serie" data-copie={copie ? "" : undefined}>
      {MOTIFS.map((motif) => (
        <li key={motif} className="bande-motifs__pastille">
          <span className="bande-motifs__voyant" />
          {motif}
        </li>
      ))}
    </ul>
  );
}
