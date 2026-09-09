import type { ReactNode } from "react";
import { IconAlertTriangle } from "@/components/icons";

/**
 * Cartes décoratives des marges du hero — des fragments du produit, pas des
 * statistiques.
 *
 * ⚠ ELLES SONT ANCRÉES SUR LE CENTRE, PAS SUR LE BORD DE L'ÉCRAN. Une carte
 *   calée sur le bord se rapproche du texte quand la fenêtre rétrécit, et finit
 *   par mordre dessus. Ancrée en `calc(50% + N)`, sa distance au centre ne
 *   change jamais : la garde tient à toutes les largeurs, sans point de rupture
 *   à surveiller.
 *
 *   N est fixé par la ligne la plus large du titre. À la taille plafond, elle
 *   mesure environ 796 px, soit 398 px de part et d'autre du centre. Les
 *   27,25 rem des cartes proches laissent donc au moins 30 px de garde, mesurés
 *   de 1024 à 2560 px. Élargir le titre ou allonger cette ligne oblige
 *   à repousser les cartes d'autant.
 *
 * ⚠ ELLES SONT DÉCORATIVES : `aria-hidden` et `pointer-events-none`. Rien de ce
 *   qu'elles montrent n'existe ailleurs sur la page — un lecteur d'écran qui
 *   les lirait n'entendrait que des bribes sans contexte.
 */

/** Une carte : fond blanc, filet fin, ombre large, légèrement inclinée. */
function Carte({
  ancrage,
  hauteur,
  rotation,
  largeur,
  filetRouge = false,
  visible,
  children,
}: {
  /** Position horizontale, toujours relative au centre. */
  ancrage: string;
  hauteur: string;
  rotation: string;
  largeur: string;
  filetRouge?: boolean;
  /** Palier d'affichage : les secondes cartes n'apparaissent qu'au-delà. */
  visible: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute hidden ${visible} ${ancrage} ${hauteur} ${rotation} ${largeur} rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[0_16px_44px_-18px_rgba(16,24,40,0.22)] ${
        filetRouge ? "border-l-[3px]" : ""
      }`}
      /* ⚠ LA COULEUR DU FILET EST EN STYLE INLINE, ET IL LE FAUT. `globals.css`
           pose `* { border-color: var(--border) }` hors de toute couche : une
           règle non affectée à une couche l'emporte sur toutes les utilitaires
           de Tailwind, quelle que soit leur spécificité. `border-l-danger`
           posait donc bien 3 px de large, mais du gris. Le style inline est le
           seul niveau qui passe devant sans toucher à cette règle globale — et
           la toucher changerait toutes les bordures du produit. */
      style={filetRouge ? { borderLeftColor: "var(--danger)" } : undefined}
    >
      {children}
    </div>
  );
}

/** Étiquette des cartes « motif détecté ». */
function Etiquette({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10.5px] tracking-[0.1em] text-faint uppercase">
      {children}
    </p>
  );
}

export function HeroCartes() {
  return (
    <div
      aria-hidden
      // ⚠ PAS DE `-z-10` ICI. Le conteneur de page porte un fond blanc : passer
      //   les cartes derrière le plan zéro les fait disparaître dessous. Elles
      //   restent au plan normal, et c'est le bloc central — posé en
      //   `relative` — qui passe devant elles.
      className="pointer-events-none absolute inset-0 select-none"
    >
      {/* 1 — l'alerte, haut gauche */}
      <Carte
        visible="lg:block"
        ancrage="right-[calc(50%+25.75rem)] xl:right-[calc(50%+27.25rem)]"
        hauteur="top-[14%]"
        rotation="-rotate-3"
        largeur="w-[248px]"
        filetRouge
      >
        <IconAlertTriangle className="text-danger" />
        <p className="mt-2 text-[13.5px] font-semibold text-foreground">
          Risque élevé de fraude
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Demande de virement détectée
        </p>
      </Carte>

      {/* 2 — un motif, bas gauche. Plus loin du centre : les deux cartes ne
          s'alignent pas verticalement. */}
      <Carte
        visible="xl:block"
        ancrage="right-[calc(50%+30.25rem)]"
        hauteur="top-[62%]"
        rotation="rotate-[2.5deg]"
        largeur="w-[236px]"
      >
        <Etiquette>Motif détecté</Etiquette>
        <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">
          Nom présent à l’annuaire, adresse d’envoi extérieure
        </p>
      </Carte>

      {/* 3 — le fragment d'email, haut droite */}
      <Carte
        visible="lg:block"
        ancrage="left-[calc(50%+25.75rem)] xl:left-[calc(50%+27.25rem)]"
        hauteur="top-[26%]"
        rotation="rotate-3"
        largeur="w-[252px]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted">
            JD
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">
              Jean Dupont
            </p>
            <p className="truncate text-[11px] text-muted">
              j.dupont@direction-groupe.net
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-faint">Objet : Virement urgent</p>
      </Carte>

      {/* 4 — le second motif, bas droite */}
      <Carte
        visible="xl:block"
        ancrage="left-[calc(50%+30.25rem)]"
        hauteur="top-[70%]"
        rotation="-rotate-2"
        largeur="w-[228px]"
      >
        <Etiquette>Motif détecté</Etiquette>
        <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">
          Pression à l’urgence et au secret
        </p>
      </Carte>
    </div>
  );
}
