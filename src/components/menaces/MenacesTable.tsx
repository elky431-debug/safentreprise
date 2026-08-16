"use client";

import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Panel, PanelHeader } from "@/components/ui";
import { IconShieldCheck } from "@/components/icons";
import type { MenaceDetectee, NiveauRisqueMenace } from "@/lib/types";

/* --------------------------------------------------------------------------
   Niveaux de risque
   -------------------------------------------------------------------------- */

export const NIVEAU_LABELS: Record<NiveauRisqueMenace, string> = {
  eleve: "Élevé",
  modere: "Modéré",
  faible: "Faible",
};

const NIVEAU_TONS: Record<NiveauRisqueMenace, string> = {
  eleve: "border-danger/25 bg-danger-soft text-danger",
  modere: "border-warning/25 bg-warning-soft text-warning",
  faible: "border-border-strong bg-surface-2 text-muted",
};

/**
 * Badge du niveau de risque, score compris : « Élevé · 85 ».
 * Réunir les deux évite de disperser l'information sur deux lignes.
 */
export function NiveauBadge({
  niveau,
  score,
}: {
  niveau: NiveauRisqueMenace;
  score?: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[11.5px] font-semibold tracking-wide ${NIVEAU_TONS[niveau]}`}
    >
      {NIVEAU_LABELS[niveau]}
      {score !== undefined && (
        <>
          <span aria-hidden className="opacity-35">
            ·
          </span>
          <span className="tabular font-medium opacity-75">{score}</span>
        </>
      )}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Signaux : phrases complètes → étiquettes courtes
   -------------------------------------------------------------------------- */

/**
 * L'extension remonte des phrases explicatives entières. Affichées telles
 * quelles, elles écrasaient le tableau sur plusieurs lignes. On les réduit
 * ici à une étiquette de quelques mots ; la phrase complète reste lisible
 * dans le détail dépliable de la ligne.
 */
const RESUMES_SIGNAUX: { motif: RegExp; label: string }[] = [
  { motif: /aucune forme de ce nom|se présente au nom/i, label: "Nom ↔ adresse" },
  { motif: /messagerie grand public/i, label: "Messagerie perso" },
  { motif: /action sensible/i, label: "Demande sensible" },
  { motif: /urgence|secret|indisponibilit/i, label: "Urgence · secret" },
  { motif: /typosquatting|ressemble fortement/i, label: "Domaine sosie" },
  { motif: /ne correspond pas au nom affich/i, label: "Adresse ↔ nom affiché" },
  { motif: /sign(é|e) «/i, label: "Signature usurpée" },
];

function resumerSignal(signal: string): string {
  const connu = RESUMES_SIGNAUX.find((r) => r.motif.test(signal));
  if (connu) return connu.label;

  // Repli — anciens formats techniques (« incoherence_nom_adresse ») ou
  // libellés inconnus : on nettoie et on tronque proprement.
  const nettoye = signal.replace(/[_-]+/g, " ").trim();
  if (!nettoye) return "Signal";
  const capitalise = nettoye.charAt(0).toUpperCase() + nettoye.slice(1);
  return capitalise.length <= 26
    ? capitalise
    : `${capitalise.slice(0, 25).trimEnd()}…`;
}

/* --------------------------------------------------------------------------
   Formatage
   -------------------------------------------------------------------------- */

/** Jour abrégé : « 15 août ». */
function formaterJour(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Heure : « 18:57 ». */
function formaterHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date complète, affichée dans le détail. */
function formaterDateComplete(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------------------------
   Filtres
   -------------------------------------------------------------------------- */

type Filtre = NiveauRisqueMenace | "tous";

const FILTRES: { cle: Filtre; label: string }[] = [
  { cle: "tous", label: "Tous" },
  { cle: "eleve", label: "Élevé" },
  { cle: "modere", label: "Modéré" },
  { cle: "faible", label: "Faible" },
];

/* --------------------------------------------------------------------------
   Tableau
   -------------------------------------------------------------------------- */

type Props = {
  menaces: MenaceDetectee[];
};

/** Tableau filtrable des tentatives détectées, triées par date décroissante. */
export function MenacesTable({ menaces }: Props) {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [ouverte, setOuverte] = useState<string | null>(null);

  const compteurs = useMemo(
    () =>
      ({
        tous: menaces.length,
        eleve: menaces.filter((m) => m.niveau_risque === "eleve").length,
        modere: menaces.filter((m) => m.niveau_risque === "modere").length,
        faible: menaces.filter((m) => m.niveau_risque === "faible").length,
      }) satisfies Record<Filtre, number>,
    [menaces],
  );

  const visibles = useMemo(
    () =>
      filtre === "tous"
        ? menaces
        : menaces.filter((m) => m.niveau_risque === filtre),
    [menaces, filtre],
  );

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Tentatives détectées"
        description="Remontées par l'extension installée sur les postes de vos collaborateurs."
        action={
          <div
            role="group"
            aria-label="Filtrer par niveau de risque"
            className="flex flex-wrap gap-1.5"
          >
            {FILTRES.map((f) => {
              const actif = filtre === f.cle;
              const vide = compteurs[f.cle] === 0;
              return (
                <button
                  key={f.cle}
                  type="button"
                  onClick={() => setFiltre(f.cle)}
                  aria-pressed={actif}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors ${
                    actif
                      ? "border-accent-line bg-accent-soft text-accent-text"
                      : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span
                    className={`tabular text-[11.5px] ${
                      actif ? "text-accent-text/70" : vide ? "text-faint/50" : "text-faint"
                    }`}
                  >
                    {compteurs[f.cle]}
                  </span>
                </button>
              );
            })}
          </div>
        }
      />

      {visibles.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-faint">
            <IconShieldCheck />
          </span>
          <p className="mt-4 text-[13.5px] text-muted">
            Aucune tentative pour ce niveau de risque.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <Th className="w-[92px] pl-6">Date</Th>
                <Th className="w-[240px]">Expéditeur</Th>
                <Th>Objet</Th>
                <Th className="w-[120px]">Niveau</Th>
                <Th className="w-[300px]">Signaux</Th>
                <th className="w-12 pr-6">
                  <span className="sr-only">Détails</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {visibles.map((menace) => {
                const estOuverte = ouverte === menace.id;
                const idDetail = `menace-detail-${menace.id}`;

                return (
                  <Fragment key={menace.id}>
                    <tr
                      className={`border-b border-border align-top transition-colors last:border-0 ${
                        estOuverte ? "bg-surface-2/50" : "hover:bg-surface-2/30"
                      }`}
                    >
                      {/* Date — jour et heure empilés, chiffres alignés */}
                      <td className="whitespace-nowrap py-4 pl-6 pr-3">
                        <p className="tabular text-[12.5px] text-foreground">
                          {formaterJour(menace.detecte_at)}
                        </p>
                        <p className="tabular mt-0.5 text-[11.5px] text-faint">
                          {formaterHeure(menace.detecte_at)}
                        </p>
                      </td>

                      {/* Expéditeur — nom, adresse, puis nom signé */}
                      <td className="max-w-[240px] px-3 py-4">
                        {menace.expediteur_nom && (
                          <p
                            className="truncate text-[13px] font-medium text-foreground"
                            title={menace.expediteur_nom}
                          >
                            {menace.expediteur_nom}
                          </p>
                        )}
                        <p
                          className="truncate font-mono text-[11.5px] text-muted"
                          title={menace.expediteur_email}
                        >
                          {menace.expediteur_email}
                        </p>
                        {menace.nom_signe && (
                          <p className="mt-1.5 truncate text-[11.5px] text-faint">
                            <span className="text-faint/70">signé</span>{" "}
                            {menace.nom_signe}
                          </p>
                        )}
                      </td>

                      {/* Objet — et destinataire en appui */}
                      <td className="max-w-0 px-3 py-4">
                        <p
                          className="truncate text-[13px] text-foreground"
                          title={menace.objet ?? undefined}
                        >
                          {menace.objet || <span className="text-faint">—</span>}
                        </p>
                        {menace.employe_email && (
                          <p
                            className="mt-1 truncate text-[11.5px] text-faint"
                            title={menace.employe_email}
                          >
                            reçu par {menace.employe_email}
                          </p>
                        )}
                      </td>

                      {/* Niveau — badge et score réunis */}
                      <td className="px-3 py-4">
                        <NiveauBadge
                          niveau={menace.niveau_risque}
                          score={menace.score}
                        />
                      </td>

                      {/* Signaux — étiquettes courtes, détail au dépliage */}
                      <td className="px-3 py-4">
                        {menace.signaux.length === 0 ? (
                          <span className="text-[12.5px] text-faint">—</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {menace.signaux.map((signal, index) => (
                              <li
                                key={`${menace.id}-${index}`}
                                title={signal}
                                className="rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted"
                              >
                                {resumerSignal(signal)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>

                      {/* Dépliage */}
                      <td className="py-4 pl-1 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setOuverte(estOuverte ? null : menace.id)
                          }
                          aria-expanded={estOuverte}
                          aria-controls={idDetail}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-faint transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground"
                        >
                          <span className="sr-only">
                            {estOuverte
                              ? "Masquer le détail"
                              : "Afficher le détail"}
                          </span>
                          <Chevron ouvert={estOuverte} />
                        </button>
                      </td>
                    </tr>

                    {estOuverte && (
                      <tr
                        id={idDetail}
                        className="border-b border-border bg-surface-2/50 last:border-0"
                      >
                        <td colSpan={6} className="px-6 pb-6 pt-1">
                          <DetailMenace menace={menace} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------------------
   Sous-composants
   -------------------------------------------------------------------------- */

function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${className}`}
    >
      {children}
    </th>
  );
}

function Chevron({ ouvert }: { ouvert: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      className={`transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6.5 8 10.5l4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Détail d'une tentative : phrases complètes des signaux et contexte. */
function DetailMenace({ menace }: { menace: MenaceDetectee }) {
  return (
    <div className="grid gap-6 rounded-xl border border-border bg-surface px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Signaux relevés
        </p>
        {menace.signaux.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">
            Aucun signal détaillé n&apos;a été transmis.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {menace.signaux.map((signal, index) => (
              <li
                key={index}
                className="flex gap-2.5 text-[13px] leading-relaxed text-muted"
              >
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-text/60"
                />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="space-y-3 lg:border-l lg:border-border lg:pl-6">
        <LigneDetail label="Détectée le" valeur={formaterDateComplete(menace.detecte_at)} />
        <LigneDetail label="Collaborateur" valeur={menace.employe_email} mono />
        <LigneDetail label="Nom signé" valeur={menace.nom_signe} />
        <LigneDetail label="Score" valeur={`${menace.score} / 100`} />
      </dl>
    </div>
  );
}

function LigneDetail({
  label,
  valeur,
  mono = false,
}: {
  label: string;
  valeur: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-[12.5px] text-foreground ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        {valeur || <span className="text-faint">—</span>}
      </dd>
    </div>
  );
}
