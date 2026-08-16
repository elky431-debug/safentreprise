"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CourbeMenaces, type PointJour } from "@/components/dashboard/CourbeMenaces";
import { useCompteurAnime } from "@/lib/use-compteur-anime";
import {
  IconAlertTriangle,
  IconShieldCheck,
  IconTarget,
  IconThreat,
} from "@/components/icons";
import type { NiveauRisqueMenace } from "@/lib/types";

/* --------------------------------------------------------------------------
   Périodes
   -------------------------------------------------------------------------- */

export type Periode = "jour" | "7j" | "30j" | "tout";

const PERIODES: { cle: Periode; label: string; titre: string }[] = [
  { cle: "jour", label: "24 h", titre: "Dernières 24 heures" },
  { cle: "7j", label: "7 j", titre: "7 derniers jours" },
  { cle: "30j", label: "30 j", titre: "30 derniers jours" },
  { cle: "tout", label: "Tout", titre: "Depuis le début" },
];

/** Nombre maximal de points tracés — au-delà, la courbe devient illisible. */
const MAX_POINTS = 180;

/** Menace allégée : le graphique n'a besoin que de la date et du niveau. */
export type MenacePourGraphique = {
  id: string;
  detecte_at: string;
  niveau_risque: NiveauRisqueMenace;
};

/* --------------------------------------------------------------------------
   Agrégation
   -------------------------------------------------------------------------- */

function cleJour(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

function cleHeure(d: Date): string {
  return `${cleJour(d)}T${String(d.getHours()).padStart(2, "0")}`;
}

/**
 * Découpe la période en intervalles et compte les alertes de chacun.
 * La fenêtre « 24 h » se lit à l'heure, les autres au jour : sur une journée,
 * un unique point ne dirait rien de la répartition.
 */
function agreger(
  menaces: MenacePourGraphique[],
  periode: Periode,
  maintenant: Date,
): { points: PointJour[]; debut: Date | null } {
  const compteurs = new Map<string, number>();

  if (periode === "jour") {
    const debut = new Date(maintenant.getTime() - 23 * 3600_000);
    debut.setMinutes(0, 0, 0);

    for (const m of menaces) {
      const d = new Date(m.detecte_at);
      if (d >= debut) compteurs.set(cleHeure(d), (compteurs.get(cleHeure(d)) ?? 0) + 1);
    }

    const points: PointJour[] = [];
    for (let i = 0; i < 24; i += 1) {
      const d = new Date(debut.getTime() + i * 3600_000);
      const heure = String(d.getHours()).padStart(2, "0");
      points.push({
        jour: cleHeure(d),
        label: `${heure}h`,
        labelLong: `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}, ${heure}h`,
        valeur: compteurs.get(cleHeure(d)) ?? 0,
      });
    }
    return { points, debut };
  }

  // Fenêtres en jours : on part de minuit pour des journées complètes.
  const aujourdhui = new Date(maintenant);
  aujourdhui.setHours(0, 0, 0, 0);

  let nbJours: number;
  if (periode === "7j") {
    nbJours = 7;
  } else if (periode === "30j") {
    nbJours = 30;
  } else {
    // « Tout » : depuis la plus ancienne alerte, sans dépasser MAX_POINTS.
    const plusAncienne = menaces.reduce<number | null>((min, m) => {
      const t = new Date(m.detecte_at).setHours(0, 0, 0, 0);
      return min === null || t < min ? t : min;
    }, null);
    nbJours =
      plusAncienne === null
        ? 7
        : Math.min(
            MAX_POINTS,
            Math.max(
              7,
              Math.round((aujourdhui.getTime() - plusAncienne) / 86_400_000) + 1,
            ),
          );
  }

  const debut = new Date(aujourdhui);
  debut.setDate(debut.getDate() - (nbJours - 1));

  for (const m of menaces) {
    const d = new Date(m.detecte_at);
    if (d >= debut) compteurs.set(cleJour(d), (compteurs.get(cleJour(d)) ?? 0) + 1);
  }

  const points: PointJour[] = [];
  for (let i = 0; i < nbJours; i += 1) {
    const d = new Date(debut);
    d.setDate(debut.getDate() + i);
    points.push({
      jour: cleJour(d),
      label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      labelLong: d.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      valeur: compteurs.get(cleJour(d)) ?? 0,
    });
  }

  return { points, debut };
}

/* --------------------------------------------------------------------------
   Cartes
   -------------------------------------------------------------------------- */

function Carte({
  label,
  icone,
  tonIcone,
  index,
  accent = false,
  children,
}: {
  label: string;
  icone: ReactNode;
  tonIcone: string;
  index: number;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`menace-card relative overflow-hidden rounded-xl border bg-surface px-4 py-4 transition-colors duration-200 ${
        accent ? "border-accent-line" : "border-border hover:border-border-strong"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] leading-tight text-muted">{label}</p>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${tonIcone}`}
        >
          {icone}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Grand chiffre commun aux cartes, avec défilement animé. */
function GrandChiffre({
  valeur,
  suffixe,
  couleur,
}: {
  valeur: number;
  suffixe?: string;
  couleur: string;
}) {
  const affichee = useCompteurAnime(valeur);
  return (
    <p
      className={`tabular mt-3 text-[34px] font-semibold leading-none tracking-[-0.045em] ${couleur}`}
    >
      {affichee}
      {suffixe && (
        <span className="text-[16px] font-medium opacity-60">{suffixe}</span>
      )}
    </p>
  );
}

/* --------------------------------------------------------------------------
   Panneau
   -------------------------------------------------------------------------- */

type Props = {
  menaces: MenacePourGraphique[];
  /** Effectif total de la société */
  employes: number;
  /** Collaborateurs distincts ayant activé l'extension */
  activations: number;
  /** Score global, extension comprise ; null si aucun questionnaire */
  scoreGlobal: number | null;
  libelleNiveauScore: string;
};

/**
 * Bloc « activité de l'extension » : sélecteur de période, quatre
 * indicateurs et courbe des alertes. La période ne pilote que les données
 * issues des menaces — le score de risque, lui, n'est pas daté.
 */
export function ActiviteExtension({
  menaces,
  employes,
  activations,
  scoreGlobal,
  libelleNiveauScore,
}: Props) {
  const [periode, setPeriode] = useState<Periode>("30j");

  // Date figée au premier rendu : évite que la fenêtre glisse à chaque calcul.
  const [maintenant] = useState(() => new Date());

  const { points, debut } = useMemo(
    () => agreger(menaces, periode, maintenant),
    [menaces, periode, maintenant],
  );

  const surPeriode = useMemo(
    () =>
      debut === null
        ? menaces
        : menaces.filter((m) => new Date(m.detecte_at) >= debut),
    [menaces, debut],
  );

  const repartition = useMemo(
    () => ({
      eleve: surPeriode.filter((m) => m.niveau_risque === "eleve").length,
      modere: surPeriode.filter((m) => m.niveau_risque === "modere").length,
      faible: surPeriode.filter((m) => m.niveau_risque === "faible").length,
    }),
    [surPeriode],
  );

  const couverture = employes > 0 ? Math.min(1, activations / employes) : 0;
  const couverturePct = Math.round(couverture * 100);
  const titrePeriode =
    PERIODES.find((p) => p.cle === periode)?.titre ?? "Période";

  return (
    <div className="space-y-3">
      {/* Sélecteur de période — contrôle segmenté, comme la page Menaces */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
          Activité de l&apos;extension
        </p>
        <div
          role="group"
          aria-label="Période affichée"
          className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-surface-2/70 p-1"
        >
          {PERIODES.map((p) => {
            const actif = periode === p.cle;
            return (
              <button
                key={p.cle}
                type="button"
                onClick={() => setPeriode(p.cle)}
                aria-pressed={actif}
                className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ${
                  actif
                    ? "bg-accent-soft text-accent-text ring-1 ring-accent-line/50"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Les quatre indicateurs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* a — volume d'alertes sur la période */}
        <Carte
          index={0}
          label="Mails alertés"
          accent
          tonIcone="border-accent-line/60 bg-accent-soft text-accent-text"
          icone={<IconThreat className="h-[15px] w-[15px]" />}
        >
          <GrandChiffre
            valeur={surPeriode.length}
            couleur={surPeriode.length === 0 ? "text-faint/70" : "text-accent-text"}
          />
          <p className="mt-3 text-[12px] leading-tight text-faint">
            {titrePeriode.toLowerCase()}
          </p>
        </Carte>

        {/* b — score de risque global, extension comprise */}
        <Carte
          index={1}
          label="Score de risque"
          tonIcone="border-border bg-surface-2 text-muted"
          icone={<IconTarget className="h-[15px] w-[15px]" />}
        >
          {scoreGlobal === null ? (
            <>
              <p className="tabular mt-3 text-[34px] font-semibold leading-none tracking-[-0.045em] text-faint/70">
                —
              </p>
              <p className="mt-3 text-[12px] leading-tight text-faint">
                Questionnaire non rempli
              </p>
            </>
          ) : (
            <>
              <GrandChiffre
                valeur={scoreGlobal}
                suffixe="%"
                couleur="text-foreground"
              />
              <p className="mt-3 text-[12px] leading-tight text-faint">
                {libelleNiveauScore} · dynamique
              </p>
            </>
          )}
        </Carte>

        {/* c — couverture du parc */}
        <Carte
          index={2}
          label="Employés protégés"
          tonIcone={
            couverturePct > 0
              ? "border-success/25 bg-success-soft text-success"
              : "border-border bg-surface-2 text-faint"
          }
          icone={<IconShieldCheck className="h-[15px] w-[15px]" />}
        >
          <p className="tabular mt-3 flex items-baseline gap-1 text-[34px] font-semibold leading-none tracking-[-0.045em] text-foreground">
            <CompteurSimple valeur={activations} />
            <span className="text-[18px] font-medium text-faint">
              / {employes}
            </span>
          </p>
          <div className="mt-4 flex items-center gap-2.5">
            <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.055]">
              <div
                className={`menace-jauge h-full rounded-full bg-success ${
                  couverturePct === 0 ? "opacity-0" : "opacity-90"
                }`}
                style={{ width: `${couverturePct}%` }}
              />
            </div>
            <span className="tabular shrink-0 text-[10.5px] leading-none text-faint">
              {couverturePct}%
            </span>
          </div>
          <p className="mt-2.5 text-[12px] leading-tight text-faint">
            de couverture
          </p>
        </Carte>

        {/* d — répartition par niveau sur la période */}
        <Carte
          index={3}
          label="Répartition"
          tonIcone={
            repartition.eleve > 0
              ? "border-danger/25 bg-danger-soft text-danger"
              : "border-border bg-surface-2 text-faint"
          }
          icone={<IconAlertTriangle className="h-[15px] w-[15px]" />}
        >
          <ul className="mt-3 space-y-2">
            <LigneNiveau
              label="Élevé"
              valeur={repartition.eleve}
              point="bg-danger"
              couleur="text-danger"
              total={surPeriode.length}
            />
            <LigneNiveau
              label="Modéré"
              valeur={repartition.modere}
              point="bg-warning"
              couleur="text-warning"
              total={surPeriode.length}
            />
            <LigneNiveau
              label="Faible"
              valeur={repartition.faible}
              point="bg-muted"
              couleur="text-foreground"
              total={surPeriode.length}
            />
          </ul>
        </Carte>
      </div>

      {/* La courbe */}
      <article className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
              Menaces détectées dans le temps
            </h2>
            <p className="mt-1 text-[12.5px] text-faint">
              {titrePeriode} · {surPeriode.length}{" "}
              {surPeriode.length > 1 ? "alertes" : "alerte"}
            </p>
          </div>
        </div>
        <div className="px-4 pb-3 pt-4">
          <CourbeMenaces points={points} />
        </div>
      </article>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Chiffre animé sans mise en forme propre, pour composer une ligne. */
function CompteurSimple({ valeur }: { valeur: number }) {
  const affichee = useCompteurAnime(valeur);
  return <>{affichee}</>;
}

function LigneNiveau({
  label,
  valeur,
  point,
  couleur,
  total,
}: {
  label: string;
  valeur: number;
  point: string;
  couleur: string;
  total: number;
}) {
  const vide = valeur === 0;
  const part = total > 0 ? Math.round((valeur / total) * 100) : 0;

  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${point} ${vide ? "opacity-25" : ""}`}
      />
      <span className="text-[12px] text-muted">{label}</span>
      <span className="ml-auto flex items-baseline gap-1.5">
        <span
          className={`tabular text-[13.5px] font-semibold ${vide ? "text-faint/70" : couleur}`}
        >
          {valeur}
        </span>
        <span className="tabular w-8 text-right text-[10.5px] text-faint/70">
          {vide ? "" : `${part}%`}
        </span>
      </span>
    </li>
  );
}
