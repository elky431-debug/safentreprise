"use client";

import type { ReactNode } from "react";
import { useCompteurAnime } from "@/lib/use-compteur-anime";
import {
  IconAlertTriangle,
  IconEye,
  IconTarget,
  IconThreat,
} from "@/components/icons";

/* --------------------------------------------------------------------------
   Tons
   -------------------------------------------------------------------------- */

type TonCompteur = "accent" | "danger" | "warning" | "neutre";

type StylesTon = {
  /** Couleur du chiffre */
  valeur: string;
  /** Icône et son cartouche */
  icone: string;
  /** Remplissage de la jauge */
  jauge: string;
  /** Bordure de la carte au repos */
  bordure: string;
};

const TONS: Record<TonCompteur, StylesTon> = {
  accent: {
    valeur: "text-accent-text",
    icone: "border-accent-line/60 bg-accent-soft text-accent-text",
    jauge: "bg-accent-text",
    bordure: "border-accent-line",
  },
  danger: {
    valeur: "text-danger",
    icone: "border-danger/25 bg-danger-soft text-danger",
    jauge: "bg-danger",
    bordure: "border-border",
  },
  warning: {
    valeur: "text-warning",
    icone: "border-warning/25 bg-warning-soft text-warning",
    jauge: "bg-warning",
    bordure: "border-border",
  },
  neutre: {
    valeur: "text-foreground",
    icone: "border-border bg-surface-2 text-faint",
    jauge: "bg-muted",
    bordure: "border-border",
  },
};

/* --------------------------------------------------------------------------
   Carte
   -------------------------------------------------------------------------- */

type CarteProps = {
  label: string;
  valeur: number;
  detail: string;
  icone: ReactNode;
  ton: TonCompteur;
  /** Part du total, entre 0 et 1 — pilote la jauge et le pourcentage */
  part?: number;
  /** Rang d'apparition, pour l'entrée en cascade */
  index: number;
};

function Carte({ label, valeur, detail, icone, ton, part, index }: CarteProps) {
  const affichee = useCompteurAnime(valeur);
  const styles = TONS[ton];
  const vide = valeur === 0;

  // Une carte de risque ne s'allume que si elle a quelque chose à signaler :
  // c'est ce qui crée la hiérarchie plutôt que quatre boîtes identiques.
  const enAlerte = ton === "danger" && !vide;

  return (
    <div
      className={`menace-card group relative overflow-hidden rounded-xl border bg-surface px-4 pb-4 pt-4 transition-[border-color,box-shadow,transform] duration-200 ${
        enAlerte
          ? "menace-card--alerte border-danger/30"
          : `${styles.bordure} hover:border-border-strong`
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Halo diffus, réservé à la carte en alerte */}
      {enAlerte && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-danger/12 blur-2xl"
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[12px] leading-tight text-muted">{label}</p>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-opacity duration-200 ${
            styles.icone
          } ${vide ? "opacity-40" : ""}`}
        >
          {icone}
        </span>
      </div>

      <p
        className={`tabular relative mt-3 text-[34px] font-semibold leading-none tracking-[-0.045em] transition-colors duration-200 ${
          vide ? "text-faint/70" : styles.valeur
        }`}
      >
        {affichee}
      </p>

      {/* Jauge filiforme : 2 px, extrémités arrondies, part du total à droite */}
      <div className="relative mt-4 flex items-center gap-2.5">
        <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.055]">
          <div
            className={`menace-jauge h-full rounded-full ${styles.jauge} ${
              vide ? "opacity-0" : "opacity-90"
            }`}
            style={{ width: `${Math.round((part ?? 0) * 100)}%` }}
          />
        </div>
        {part !== undefined && (
          <span
            className={`tabular shrink-0 text-[10.5px] leading-none ${
              vide ? "text-faint/50" : "text-faint"
            }`}
          >
            {Math.round(part * 100)}%
          </span>
        )}
      </div>

      <p className="relative mt-2.5 text-[12px] leading-tight text-faint">
        {detail}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Bandeau des quatre indicateurs
   -------------------------------------------------------------------------- */

type Props = {
  total: number;
  eleve: number;
  modere: number;
  faible: number;
};

/** Synthèse du mois : total, puis répartition par niveau de risque. */
export function MenacesStats({ total, eleve, modere, faible }: Props) {
  const part = (n: number) => (total ? n / total : 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Carte
        index={0}
        label="Ce mois-ci"
        valeur={total}
        detail={total > 1 ? "tentatives détectées" : "tentative détectée"}
        icone={<IconThreat className="h-[15px] w-[15px]" />}
        ton="accent"
        part={total ? 1 : 0}
      />
      <Carte
        index={1}
        label="Risque élevé"
        valeur={eleve}
        detail="usurpation caractérisée"
        icone={<IconAlertTriangle className="h-[15px] w-[15px]" />}
        ton="danger"
        part={part(eleve)}
      />
      <Carte
        index={2}
        label="Risque modéré"
        valeur={modere}
        detail="signaux concordants"
        icone={<IconTarget className="h-[15px] w-[15px]" />}
        ton="warning"
        part={part(modere)}
      />
      <Carte
        index={3}
        label="Risque faible"
        valeur={faible}
        detail="à surveiller"
        icone={<IconEye className="h-[15px] w-[15px]" />}
        ton="neutre"
        part={part(faible)}
      />
    </div>
  );
}
