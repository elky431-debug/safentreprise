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

const NIVEAU_TONS: Record<NiveauRisqueMenace, { badge: string; point: string }> = {
  eleve: {
    badge: "border-danger/25 bg-danger-soft text-danger",
    point: "bg-danger",
  },
  modere: {
    badge: "border-warning/25 bg-warning-soft text-warning",
    point: "bg-warning",
  },
  faible: {
    badge: "border-border-strong bg-surface-2 text-muted",
    point: "bg-muted",
  },
};

/**
 * Badge du niveau de risque, pastille et score compris : « ● Élevé · 85 ».
 * Réunir les trois évite de disperser l'information sur deux lignes.
 */
export function NiveauBadge({
  niveau,
  score,
}: {
  niveau: NiveauRisqueMenace;
  score?: number;
}) {
  const ton = NIVEAU_TONS[niveau];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-2 pr-2.5 text-[11.5px] font-semibold tracking-wide ${ton.badge}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ton.point}`} />
      {NIVEAU_LABELS[niveau]}
      {score !== undefined && (
        <>
          <span aria-hidden className="opacity-30">
            ·
          </span>
          <span className="tabular font-medium opacity-70">{score}</span>
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
/** Familles de signaux, chacune avec sa teinte de fond. */
type TonSignal = "identite" | "canal" | "action";

const TONS_SIGNAL: Record<TonSignal, string> = {
  // Incohérence d'identité — teinte de la marque
  identite: "border-accent-line/40 bg-accent-soft text-accent-text",
  // Canal d'envoi douteux — ambre
  canal: "border-warning/20 bg-warning-soft text-warning",
  // Passage à l'acte (argent, urgence) — rouge
  action: "border-danger/20 bg-danger-soft text-danger",
};

const RESUMES_SIGNAUX: { motif: RegExp; label: string; ton: TonSignal }[] = [
  { motif: /aucune forme de ce nom|se présente au nom/i, label: "Nom ↔ adresse", ton: "identite" },
  { motif: /ne correspond pas au nom affich/i, label: "Adresse ↔ nom affiché", ton: "identite" },
  { motif: /sign(é|e) «/i, label: "Signature usurpée", ton: "identite" },
  { motif: /messagerie grand public/i, label: "Messagerie perso", ton: "canal" },
  { motif: /typosquatting|ressemble fortement/i, label: "Domaine sosie", ton: "canal" },
  { motif: /action sensible/i, label: "Demande sensible", ton: "action" },
  { motif: /urgence|secret|indisponibilit/i, label: "Urgence · secret", ton: "action" },
];

function resumerSignal(signal: string): { label: string; ton: TonSignal | null } {
  const connu = RESUMES_SIGNAUX.find((r) => r.motif.test(signal));
  if (connu) return { label: connu.label, ton: connu.ton };

  // Repli — anciens formats techniques (« incoherence_nom_adresse ») ou
  // libellés inconnus : on nettoie, on tronque, et on reste en neutre.
  const nettoye = signal.replace(/[_-]+/g, " ").trim();
  if (!nettoye) return { label: "Signal", ton: null };
  const capitalise = nettoye.charAt(0).toUpperCase() + nettoye.slice(1);
  return {
    label:
      capitalise.length <= 26
        ? capitalise
        : `${capitalise.slice(0, 25).trimEnd()}…`,
    ton: null,
  };
}

/** Pastille d'un signal — fond teinté selon la famille. */
function SignalBadge({ signal }: { signal: string }) {
  const { label, ton } = resumerSignal(signal);
  return (
    <li
      title={signal}
      className={`rounded-full border px-2 py-[3px] text-[11px] font-medium leading-none transition-colors duration-150 ${
        ton ? TONS_SIGNAL[ton] : "border-border bg-surface-2 text-muted"
      }`}
    >
      {label}
    </li>
  );
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

/**
 * Chaque filtre s'active dans SA couleur plutôt qu'un bleu uniforme :
 * le segment sélectionné rappelle ainsi le niveau qu'il isole.
 */
const FILTRES: { cle: Filtre; label: string; actif: string }[] = [
  { cle: "tous", label: "Tous", actif: "bg-accent-soft text-accent-text ring-accent-line/50" },
  { cle: "eleve", label: "Élevé", actif: "bg-danger-soft text-danger ring-danger/25" },
  { cle: "modere", label: "Modéré", actif: "bg-warning-soft text-warning ring-warning/25" },
  { cle: "faible", label: "Faible", actif: "bg-surface-3 text-foreground ring-border-strong" },
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
          /* Segmented control : un rail creux, un seul segment en relief */
          <div
            role="group"
            aria-label="Filtrer par niveau de risque"
            className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-surface-2/70 p-1"
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
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ${
                    actif
                      ? `${f.actif} ring-1`
                      : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span
                    className={`tabular text-[11px] ${
                      actif
                        ? "opacity-60"
                        : vide
                          ? "text-faint/40"
                          : "text-faint"
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
              {visibles.map((menace, rang) => {
                const estOuverte = ouverte === menace.id;
                const idDetail = `menace-detail-${menace.id}`;

                return (
                  <Fragment key={menace.id}>
                    <tr
                      className={`menace-row group border-b border-border align-top transition-colors duration-200 last:border-0 ${
                        estOuverte ? "bg-surface-2/60" : "hover:bg-white/[0.022]"
                      }`}
                      /* Cascade plafonnée : au-delà de 12 lignes, plus de délai */
                      style={{ animationDelay: `${Math.min(rang, 12) * 35}ms` }}
                    >
                      {/* Date — jour et heure empilés, chiffres alignés */}
                      <td className="whitespace-nowrap py-[18px] pl-6 pr-3">
                        <p className="tabular text-[12.5px] text-foreground">
                          {formaterJour(menace.detecte_at)}
                        </p>
                        <p className="tabular mt-1 text-[11.5px] text-faint">
                          {formaterHeure(menace.detecte_at)}
                        </p>
                      </td>

                      {/* Expéditeur — nom en évidence, adresse en mono, nom signé en appui */}
                      <td className="max-w-[240px] px-3 py-[18px]">
                        {menace.expediteur_nom && (
                          <p
                            className="truncate text-[13px] font-medium tracking-[-0.01em] text-foreground"
                            title={menace.expediteur_nom}
                          >
                            {menace.expediteur_nom}
                          </p>
                        )}
                        <p
                          className="mt-0.5 truncate font-mono text-[11.5px] text-muted"
                          title={menace.expediteur_email}
                        >
                          {menace.expediteur_email}
                        </p>
                        {menace.nom_signe && (
                          <p className="mt-2 flex items-baseline gap-1.5 truncate">
                            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint/60">
                              signé
                            </span>
                            <span className="truncate text-[11.5px] text-muted">
                              {menace.nom_signe}
                            </span>
                          </p>
                        )}
                      </td>

                      {/* Objet — et destinataire en appui */}
                      <td className="max-w-0 px-3 py-[18px]">
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

                      {/* Niveau — pastille, libellé et score réunis */}
                      <td className="px-3 py-[18px]">
                        <NiveauBadge
                          niveau={menace.niveau_risque}
                          score={menace.score}
                        />
                      </td>

                      {/* Signaux — pastilles teintées par famille */}
                      <td className="px-3 py-[18px]">
                        {menace.signaux.length === 0 ? (
                          <span className="text-[12.5px] text-faint">—</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {menace.signaux.map((signal, index) => (
                              <SignalBadge
                                key={`${menace.id}-${index}`}
                                signal={signal}
                              />
                            ))}
                          </ul>
                        )}
                      </td>

                      {/* Dépliage — le chevron se révèle au survol de la ligne */}
                      <td className="py-[18px] pl-1 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setOuverte(estOuverte ? null : menace.id)
                          }
                          aria-expanded={estOuverte}
                          aria-controls={idDetail}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-[background-color,border-color,color,opacity] duration-200 focus-visible:opacity-100 ${
                            estOuverte
                              ? "border-border-strong bg-surface-3 text-foreground"
                              : "border-transparent text-faint opacity-45 hover:border-border hover:bg-surface-2 hover:text-foreground group-hover:opacity-100"
                          }`}
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
