"use client";

import { useCallback, useRef, useState } from "react";
import { IconAlertTriangle } from "@/components/icons";

/** Signaux affichés dans la bannière. */
const SIGNAUX = [
  "Domaine grand public",
  "Demande de virement",
  "Urgence inhabituelle",
];

/**
 * Comparateur avant / après : le même message, avec et sans l'avertissement,
 * révélés par un curseur horizontal.
 *
 * ⚠ LES DEUX COUCHES PARTAGENT LE MÊME BALISAGE, AU PIXEL PRÈS. La bannière et
 *   la pastille « Protection active » existent dans les deux : dans celle du
 *   dessous elles sont en `invisible`, c'est-à-dire `visibility: hidden`, qui
 *   cache sans libérer la place. Les masquer avec `hidden` ferait remonter le
 *   message d'un bloc entier au passage du curseur — et c'est précisément ce
 *   que ce comparateur doit démentir : le message ne bouge pas, seul
 *   l'avertissement apparaît.
 *
 * ⚠ LA HAUTEUR N'EST PAS FIXÉE EN DUR. La couche du dessous reste dans le flux
 *   et donne sa hauteur au cadre ; celle du dessus est en `absolute inset-0` et
 *   l'épouse. Une hauteur en pixels aurait fini par couper le message dès qu'un
 *   texte se serait replié différemment.
 */
export function ComparateurBanniere() {
  const cadre = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(45);

  /** Position du curseur, en pourcentage de la largeur du cadre. */
  const suivrePointeur = useCallback((x: number) => {
    const boite = cadre.current?.getBoundingClientRect();
    if (!boite || boite.width === 0) return;
    const pourcent = ((x - boite.left) / boite.width) * 100;
    setPosition(Math.min(100, Math.max(0, pourcent)));
  }, []);

  function auClavier(e: React.KeyboardEvent) {
    const pas = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft") setPosition((p) => Math.max(0, p - pas));
    else if (e.key === "ArrowRight") setPosition((p) => Math.min(100, p + pas));
    else if (e.key === "Home") setPosition(0);
    else if (e.key === "End") setPosition(100);
    else return;
    e.preventDefault();
  }

  return (
    <figure className="m-0">
      {/* Les deux étiquettes sont posées au-dessus du cadre, hors du thème
          clair : à l'intérieur, elles auraient été découpées par le curseur ou
          entrées en collision avec la barre du client de messagerie. */}
      <div className="mb-3 flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">Sans Safentreprise</span>
        <span className="font-medium text-danger">Avec Safentreprise</span>
      </div>

      <div
        ref={cadre}
        // `touch-pan-y` laisse le défilement vertical au navigateur et ne nous
        // réserve que l'horizontal : sur mobile, la page reste faisable au
        // doigt par-dessus le comparateur.
        className="theme-clair relative touch-pan-y overflow-hidden rounded-[12px] border border-border-strong bg-surface select-none shadow-[0_24px_56px_-24px_rgba(16,20,26,0.28)]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          suivrePointeur(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) suivrePointeur(e.clientX);
        }}
      >
        {/* Couche du dessous — le message tel qu'il arrive. Masquée aux
            lecteurs d'écran : c'est un doublon visuel de celle du dessus, qui
            porte la même chose plus l'avertissement. */}
        <div aria-hidden>
          <Message averti={false} />
        </div>

        {/* Couche du dessus — le même message, surmonté de la bannière. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        >
          <Message averti />
        </div>

        {/* La ligne de séparation et sa poignée. */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: `${position}%` }}
        >
          <div className="h-full w-[2px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(16,20,26,0.28)]" />

          <button
            type="button"
            role="slider"
            aria-label="Comparer le message avec et sans l’avertissement"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`Avertissement révélé sur ${Math.round(100 - position)} % du message`}
            onKeyDown={auClavier}
            className="pointer-events-auto absolute top-1/2 left-0 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-border-strong bg-white text-muted shadow-[0_4px_14px_-2px_rgba(16,20,26,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Chevrons />
          </button>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-[12.5px] text-faint">
        Le message est identique. Seul l’avertissement change.
      </figcaption>
    </figure>
  );
}

/** Deux chevrons opposés, dessinés plutôt qu'importés. */
function Chevrons() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M10 7 5 12l5 5" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

/**
 * Le message, dans sa version avertie ou non.
 *
 * ⚠ LE BALISAGE EST LE MÊME DANS LES DEUX CAS. Seule la visibilité change.
 */
function Message({ averti }: { averti: boolean }) {
  const cache = averti ? "" : "invisible";

  return (
    <div className="w-full">
      {/* Barre du client de messagerie */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-2/70 px-4 py-2.5">
        <span className="eyebrow">Boîte de réception</span>
        <span
          className={`inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-accent-text ${cache}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
          Protection active
        </span>
      </div>

      {/* La bannière d'alerte */}
      <div className={cache}>
        <div className="border-b border-danger/25 bg-danger-soft px-4 py-4 md:px-5">
          <div className="flex gap-3">
            <IconAlertTriangle className="mt-0.5 shrink-0 text-danger" />

            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-danger">
                Expéditeur potentiellement usurpé · Risque élevé
              </p>

              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                Le nom affiché{" "}
                <span className="text-foreground">« Jean Dupont »</span> est
                celui de votre dirigeant, mais ce message provient d’une adresse
                personnelle extérieure à l’entreprise.
              </p>

              <ul className="mt-3.5 flex flex-wrap gap-2">
                {SIGNAUX.map((signal) => (
                  <li
                    key={signal}
                    className="rounded-[5px] border border-danger/25 px-2 py-1 text-[11px] text-danger"
                  >
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Le message frauduleux, identique dans les deux couches */}
      <div className="px-5 py-6 md:px-6">
        <dl className="space-y-2.5 border-b border-border pb-5 text-[13px]">
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 text-faint">De</dt>
            <dd className="min-w-0">
              <span className="text-foreground">Jean Dupont</span>{" "}
              <span className="font-mono text-[12px] text-muted">
                &lt;j.dupont2024@gmail.com&gt;
              </span>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 text-faint">Objet</dt>
            <dd className="font-medium text-foreground">
              Virement urgent — confidentiel
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-3.5 text-[13.5px] leading-relaxed text-muted">
          <p>
            Sophie, je suis en déplacement et je ne peux pas être joint. Merci de
            régler ce virement de{" "}
            <span className="text-foreground">47 800 €</span> aujourd’hui, sans
            passer par la validation habituelle.
          </p>
          <p className="text-foreground">Jean</p>
        </div>
      </div>
    </div>
  );
}
