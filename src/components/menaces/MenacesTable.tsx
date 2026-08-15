"use client";

import { useMemo, useState } from "react";
import { Panel, PanelHeader } from "@/components/ui";
import type { MenaceDetectee, NiveauRisqueMenace } from "@/lib/types";

/** Libellés et couleurs par niveau — cohérents avec StatutBadge. */
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

/** Badge coloré du niveau de risque. */
export function NiveauBadge({ niveau }: { niveau: NiveauRisqueMenace }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${NIVEAU_TONS[niveau]}`}
    >
      {NIVEAU_LABELS[niveau]}
    </span>
  );
}

type Filtre = NiveauRisqueMenace | "tous";

const FILTRES: { cle: Filtre; label: string }[] = [
  { cle: "tous", label: "Tous" },
  { cle: "eleve", label: "Élevé" },
  { cle: "modere", label: "Modéré" },
  { cle: "faible", label: "Faible" },
];

/** Date lisible : « 14 août, 09:32 ». */
function formaterDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Remplace les identifiants techniques par des libellés lisibles. */
function formaterSignal(signal: string): string {
  return signal.replace(/[_-]+/g, " ");
}

type Props = {
  menaces: MenaceDetectee[];
};

/** Tableau filtrable des tentatives détectées, triées par date décroissante. */
export function MenacesTable({ menaces }: Props) {
  const [filtre, setFiltre] = useState<Filtre>("tous");

  const compteurs = useMemo(() => {
    return {
      tous: menaces.length,
      eleve: menaces.filter((m) => m.niveau_risque === "eleve").length,
      modere: menaces.filter((m) => m.niveau_risque === "modere").length,
      faible: menaces.filter((m) => m.niveau_risque === "faible").length,
    } satisfies Record<Filtre, number>;
  }, [menaces]);

  const visibles = useMemo(
    () =>
      filtre === "tous"
        ? menaces
        : menaces.filter((m) => m.niveau_risque === filtre),
    [menaces, filtre],
  );

  return (
    <Panel>
      <PanelHeader
        title="Tentatives détectées"
        description="Remontées par l'extension installée sur les postes de vos collaborateurs."
        action={
          <div className="flex flex-wrap gap-1.5">
            {FILTRES.map((f) => {
              const actif = filtre === f.cle;
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
                  <span className="tabular text-[11.5px] text-faint">
                    {compteurs[f.cle]}
                  </span>
                </button>
              );
            })}
          </div>
        }
      />

      {visibles.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13.5px] text-muted">
          Aucune tentative pour ce niveau de risque.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-[11.5px] font-medium text-faint">
                  Date
                </th>
                <th className="px-4 py-3 text-[11.5px] font-medium text-faint">
                  Expéditeur
                </th>
                <th className="px-4 py-3 text-[11.5px] font-medium text-faint">
                  Objet
                </th>
                <th className="px-4 py-3 text-[11.5px] font-medium text-faint">
                  Niveau
                </th>
                <th className="px-6 py-3 text-[11.5px] font-medium text-faint">
                  Signaux
                </th>
              </tr>
            </thead>

            <tbody>
              {visibles.map((menace) => (
                <tr
                  key={menace.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="tabular whitespace-nowrap px-6 py-4 text-[12.5px] text-muted">
                    {formaterDate(menace.detecte_at)}
                  </td>

                  <td className="px-4 py-4">
                    {menace.expediteur_nom && (
                      <p className="text-[13px] text-foreground">
                        {menace.expediteur_nom}
                      </p>
                    )}
                    <p className="break-all font-mono text-[12px] text-muted">
                      {menace.expediteur_email}
                    </p>
                    {menace.nom_signe && (
                      <p className="mt-1 text-[11.5px] text-faint">
                        Signé «&nbsp;{menace.nom_signe}&nbsp;»
                      </p>
                    )}
                  </td>

                  <td className="max-w-[260px] px-4 py-4 text-[13px] text-foreground">
                    {menace.objet ?? (
                      <span className="text-faint">—</span>
                    )}
                    {menace.employe_email && (
                      <p className="mt-1 break-all text-[11.5px] text-faint">
                        Reçu par {menace.employe_email}
                      </p>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4">
                    <NiveauBadge niveau={menace.niveau_risque} />
                    <p className="tabular mt-1.5 text-[11.5px] text-faint">
                      score {menace.score}
                    </p>
                  </td>

                  <td className="px-6 py-4">
                    {menace.signaux.length === 0 ? (
                      <span className="text-[12.5px] text-faint">—</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {menace.signaux.map((signal) => (
                          <li
                            key={signal}
                            className="rounded-[5px] border border-border px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {formaterSignal(signal)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
