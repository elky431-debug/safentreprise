"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import { resumeCampagne } from "@/lib/campaigns";
import { SEUIL_QUIZ_BON } from "@/lib/risk-dynamique";
import type { Campaign, ModeResultats } from "@/lib/types";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { StatutBadge } from "@/components/campaigns/StatutBadge";
import { IconCertificate } from "@/components/icons";

export type LigneResultat = {
  id: string;
  /** Pour préremplir une relance — jamais affiché en mode anonymisé. */
  employee_id: string;
  prenom: string;
  email: string;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
  message_envoye: boolean;
};

type StatutLigne = "signale" | "piege" | "neutre";
type FiltreStatut = "tous" | StatutLigne;

type Props = {
  campaign: Campaign;
  cibles: LigneResultat[];
  modeResultats: ModeResultats;
  /** URL publique du PDF d'attestation, si déjà généré. */
  certificatUrl: string | null;
};

/** Statut métier : signalement > clic > neutre. */
export function statutCible(c: LigneResultat): StatutLigne {
  if (c.a_signale) return "signale";
  if (c.a_clique) return "piege";
  return "neutre";
}

function pourcent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Ordre de risque : piégés d'abord, puis sans action, puis signalés. */
function ordreRisque(s: StatutLigne): number {
  if (s === "piege") return 0;
  if (s === "neutre") return 1;
  return 2;
}

const FILTRES: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "piege", label: "Piégés" },
  { id: "signale", label: "Ont signalé" },
  { id: "neutre", label: "Sans action" },
];

/**
 * Page résultats d'une campagne envoyée — dashboard analytique.
 * La logique (filtres, exports, relance) est inchangée ; seul le design anime.
 */
export function CampaignResults({
  campaign,
  cibles,
  modeResultats,
  certificatUrl,
}: Props) {
  const anonymise = modeResultats === "anonymise";
  const [filtre, setFiltre] = useState<FiltreStatut>("tous");
  const [exportEnCours, setExportEnCours] = useState<"csv" | "xlsx" | "pdf" | null>(
    null,
  );

  const total = cibles.length;
  const pieges = cibles.filter((c) => statutCible(c) === "piege").length;
  const signales = cibles.filter((c) => statutCible(c) === "signale").length;
  const neutres = total - pieges - signales;
  const quizOk = cibles.filter((c) => c.quiz_complete).length;
  const quizReussis = cibles.filter(
    (c) => c.quiz_complete && (c.score_quiz ?? 0) >= SEUIL_QUIZ_BON,
  ).length;
  const quizARevoir = quizOk - quizReussis;

  const tauxClic = pourcent(pieges, total);
  const tauxSignalement = pourcent(signales, total);
  const tauxQuiz = pourcent(quizOk, total);

  const lignesTriees = useMemo(() => {
    return [...cibles].sort((a, b) => {
      const diff = ordreRisque(statutCible(a)) - ordreRisque(statutCible(b));
      if (diff !== 0) return diff;
      return a.prenom.localeCompare(b.prenom, "fr");
    });
  }, [cibles]);

  const lignesFiltrees = useMemo(() => {
    if (filtre === "tous") return lignesTriees;
    return lignesTriees.filter((c) => statutCible(c) === filtre);
  }, [lignesTriees, filtre]);

  const urlRelance = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", campaign.id);
    params.set("type", campaign.type_fraude === "fournisseur" ? "fournisseur" : "president");
    params.set(
      "canal",
      campaign.canal === "sms" || campaign.canal === "email"
        ? campaign.canal
        : "email",
    );
    params.set("nom", `Relance — ${campaign.nom}`);
    const ids = [...new Set(cibles.map((c) => c.employee_id).filter(Boolean))];
    if (ids.length) params.set("cibles", ids.join(","));
    return `/campaigns/new?${params.toString()}`;
  }, [campaign, cibles]);

  function libelleStatut(s: StatutLigne): string {
    if (s === "piege") return "Piégé";
    if (s === "signale") return "A signalé";
    return "Aucune action";
  }

  function telechargerBlob(blob: Blob, nomFichier: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Export CSV (nominatif ou agrégé selon le mode). */
  function exporterCsv() {
    setExportEnCours("csv");
    try {
      const slug = slugifier(campaign.nom);
      if (anonymise) {
        const rows = [
          ["Indicateur", "Valeur"],
          ["Campagne", campaign.nom],
          ["Collaborateurs testés", String(total)],
          ["Taux de clic (%)", String(tauxClic)],
          ["Taux de signalement (%)", String(tauxSignalement)],
          ["Quiz complété (%)", String(tauxQuiz)],
          ["Piégés", String(pieges)],
          ["Ont signalé", String(signales)],
          ["Sans action", String(neutres)],
        ];
        const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
        telechargerBlob(
          new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
          `resultats-${slug}-anonyme.csv`,
        );
      } else {
        const header = [
          "Prenom",
          "Email",
          "Statut",
          "Quiz complete",
          "Score quiz",
        ];
        const rows = lignesTriees.map((c) => [
          c.prenom,
          c.email,
          libelleStatut(statutCible(c)),
          c.quiz_complete ? "Oui" : "Non",
          c.score_quiz !== null ? String(c.score_quiz) : "",
        ]);
        const csv = [header, ...rows]
          .map((r) => r.map(csvEscape).join(";"))
          .join("\n");
        telechargerBlob(
          new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
          `resultats-${slug}.csv`,
        );
      }
    } finally {
      setExportEnCours(null);
    }
  }

  /** Export Excel via SheetJS. */
  function exporterExcel() {
    setExportEnCours("xlsx");
    try {
      const slug = slugifier(campaign.nom);
      const wb = XLSX.utils.book_new();
      if (anonymise) {
        const ws = XLSX.utils.aoa_to_sheet([
          ["Indicateur", "Valeur"],
          ["Campagne", campaign.nom],
          ["Collaborateurs testés", total],
          ["Taux de clic (%)", tauxClic],
          ["Taux de signalement (%)", tauxSignalement],
          ["Quiz complété (%)", tauxQuiz],
          ["Piégés", pieges],
          ["Ont signalé", signales],
          ["Sans action", neutres],
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Synthese");
        XLSX.writeFile(wb, `resultats-${slug}-anonyme.xlsx`);
      } else {
        const data = lignesTriees.map((c) => ({
          Prenom: c.prenom,
          Email: c.email,
          Statut: libelleStatut(statutCible(c)),
          "Quiz complete": c.quiz_complete ? "Oui" : "Non",
          "Score quiz": c.score_quiz ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Resultats");
        XLSX.writeFile(wb, `resultats-${slug}.xlsx`);
      }
    } finally {
      setExportEnCours(null);
    }
  }

  /** Export PDF de synthèse (pdf-lib). */
  async function exporterPdf() {
    setExportEnCours("pdf");
    try {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const accent = rgb(0.055, 0.522, 0.576);
      const ink = rgb(0.12, 0.14, 0.16);
      const muted = rgb(0.4, 0.43, 0.46);
      const { width, height } = page.getSize();
      const marge = 48;
      let y = height - marge;

      page.drawRectangle({
        x: 0,
        y: height - 6,
        width,
        height: 6,
        color: accent,
      });

      page.drawText("Safentreprise — Resultats de campagne", {
        x: marge,
        y,
        size: 11,
        font: fontBold,
        color: accent,
      });
      y -= 28;
      page.drawText(campaign.nom.slice(0, 60), {
        x: marge,
        y,
        size: 18,
        font: fontBold,
        color: ink,
      });
      y -= 22;
      page.drawText(
        anonymise
          ? "Mode anonymise — statistiques agregees uniquement"
          : "Detail nominatif des collaborateurs",
        { x: marge, y, size: 10, font, color: muted },
      );
      y -= 36;

      const kpis = [
        ["Taux de clic", `${tauxClic} % (${pieges}/${total})`],
        ["Taux de signalement", `${tauxSignalement} % (${signales}/${total})`],
        ["Quiz complete", `${tauxQuiz} % (${quizOk}/${total})`],
        ["Collaborateurs testes", String(total)],
      ];
      for (const [label, val] of kpis) {
        page.drawText(label, { x: marge, y, size: 10, font, color: muted });
        page.drawText(val, {
          x: marge + 180,
          y,
          size: 11,
          font: fontBold,
          color: ink,
        });
        y -= 18;
      }

      if (!anonymise) {
        y -= 16;
        page.drawText("Collaborateurs (tries par risque)", {
          x: marge,
          y,
          size: 11,
          font: fontBold,
          color: ink,
        });
        y -= 18;
        for (const c of lignesTriees.slice(0, 40)) {
          if (y < 60) break;
          const ligne = `${c.prenom} — ${libelleStatut(statutCible(c))} — quiz ${
            c.quiz_complete ? (c.score_quiz ?? "ok") : "non"
          }`;
          page.drawText(ligne.slice(0, 90), {
            x: marge,
            y,
            size: 9,
            font,
            color: muted,
          });
          y -= 14;
        }
        if (lignesTriees.length > 40) {
          page.drawText(`… et ${lignesTriees.length - 40} autre(s)`, {
            x: marge,
            y,
            size: 9,
            font,
            color: muted,
          });
        }
      }

      const bytes = await doc.save();
      telechargerBlob(
        new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
        `resultats-${slugifier(campaign.nom)}${anonymise ? "-anonyme" : ""}.pdf`,
      );
    } finally {
      setExportEnCours(null);
    }
  }

  const verdict =
    total === 0
      ? "Aucune cible n'a encore été mesurée."
      : tauxClic >= 40
        ? "Exposition élevée — une relance ciblée sur les piégés s'impose."
        : tauxSignalement >= 50
          ? "Bons réflexes majoritaires — consolidez avec une simulation régulière."
          : tauxClic === 0 && tauxSignalement === 0
            ? "Pas encore de réaction mesurée — les destinataires n'ont pas agi."
            : "Résultat mixte — identifiez qui a besoin d'un rappel.";

  const tonClic =
    tauxClic >= 40 ? "danger" : tauxClic >= 20 ? "warning" : "ok";

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-5">
      {/* En-tête compact */}
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/campaigns"
            className="text-[13px] text-faint transition-colors duration-200 hover:text-foreground"
          >
            ← Campagnes
          </Link>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatutBadge statut={campaign.statut} />
            {anonymise && (
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-text">
                Anonymisé
              </span>
            )}
            <span className="text-[12.5px] text-muted">
              {resumeCampagne(campaign.type_fraude, campaign.canal)}
            </span>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-foreground sm:text-[24px]">
            {campaign.nom}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface sm:flex">
            {(
              [
                ["CSV", exporterCsv],
                ["Excel", exporterExcel],
                ["PDF", () => void exporterPdf()],
              ] as const
            ).map(([label, action], i) => (
              <button
                key={label}
                type="button"
                disabled={exportEnCours !== null}
                onClick={action}
                className={`px-3.5 py-2 text-[12.5px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground disabled:opacity-50 ${
                  i > 0 ? "border-l border-border" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {certificatUrl && (
            <a
              href={certificatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonSecondary}
              download
            >
              <IconCertificate />
              Attestation
            </a>
          )}
          <Link href={urlRelance} className={buttonPrimary}>
            Relancer
          </Link>
        </div>
      </header>

      {/* Rangée KPI */}
      <section className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={1}
          label="Taux de clic"
          value={tauxClic}
          suffix="%"
          detail={`${pieges} piégé${pieges !== 1 ? "s" : ""}`}
          pct={tauxClic}
          tone={
            tonClic === "danger"
              ? "danger"
              : tonClic === "warning"
                ? "warning"
                : "accent"
          }
          featured
          icon={<IconClick />}
        />
        <KpiCard
          index={2}
          label="Taux de signalement"
          value={tauxSignalement}
          suffix="%"
          detail={`${signales} / ${total}`}
          pct={tauxSignalement}
          tone="success"
          icon={<IconShield />}
        />
        <KpiCard
          index={3}
          label="Quiz complété"
          value={tauxQuiz}
          suffix="%"
          detail={`${quizOk} / ${total}`}
          pct={tauxQuiz}
          tone="accent"
          icon={<IconQuiz />}
        />
        <KpiCard
          index={4}
          label="Collaborateurs testés"
          value={total}
          detail="effectif de la campagne"
          pct={100}
          tone="neutral"
          icon={<IconPeople />}
        />
      </section>

      {/* Anneau + détail */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex shrink-0 flex-col items-center gap-4 rounded-xl border border-border bg-surface p-5 lg:items-stretch">
          <p className="w-full text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
            Exposition
          </p>
          <div className="flex justify-center py-2">
            <ScoreRing pourcentage={tauxClic} ton={tonClic} />
          </div>
          <p className="text-[13px] leading-relaxed text-muted">{verdict}</p>
          {anonymise && quizOk > 0 && (
            <dl className="mt-auto w-full space-y-0 border-t border-border pt-3">
              <div className="flex justify-between py-2 text-[13px]">
                <dt className="text-muted">Quiz réussi</dt>
                <dd className="tabular font-medium text-success">
                  {quizReussis}/{quizOk}
                </dd>
              </div>
              <div className="flex justify-between py-2 text-[13px]">
                <dt className="text-muted">Quiz à revoir</dt>
                <dd className="tabular font-medium text-danger">
                  {quizARevoir}/{quizOk}
                </dd>
              </div>
            </dl>
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          {anonymise ? (
            <div className="flex flex-1 flex-col justify-center px-6 py-10">
              <h2 className="text-[15px] font-semibold text-foreground">
                Mode anonymisé
              </h2>
              <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
                Aucun nom ni email n&apos;est affiché. Les indicateurs ci-dessus
                résument la campagne de façon agrégée.
              </p>
              <ul className="mt-8 max-w-sm space-y-4">
                <RepartitionLigne
                  label="A signalé"
                  valeur={signales}
                  total={total}
                  tone="success"
                />
                <RepartitionLigne
                  label="Piégé"
                  valeur={pieges}
                  total={total}
                  tone="danger"
                />
                <RepartitionLigne
                  label="Aucune action"
                  valeur={neutres}
                  total={total}
                  tone="neutre"
                />
              </ul>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                  <h2 className="text-[14px] font-semibold text-foreground">
                    Collaborateurs
                  </h2>
                  <p className="mt-0.5 text-[12px] text-muted">
                    Triés par risque · {lignesFiltrees.length} affiché
                    {lignesFiltrees.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
                  {FILTRES.map((f) => {
                    const count =
                      f.id === "tous"
                        ? total
                        : f.id === "piege"
                          ? pieges
                          : f.id === "signale"
                            ? signales
                            : neutres;
                    const actif = filtre === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFiltre(f.id)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-150 ${
                          actif
                            ? "bg-surface-2 text-foreground"
                            : "text-faint hover:text-muted"
                        }`}
                      >
                        {f.label}
                        <span
                          className={`tabular text-[11px] transition-colors duration-150 ${
                            actif ? "text-accent-text" : "text-faint"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-[1] bg-surface/95 backdrop-blur-sm">
                    <tr className="border-b border-border text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
                      <th className="px-5 py-2.5 font-medium">Nom</th>
                      <th className="px-3 py-2.5 font-medium">Statut</th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Quiz
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesFiltrees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-5 py-14 text-center text-[13.5px] text-muted"
                        >
                          {cibles.length === 0
                            ? "Aucune cible sur cette campagne."
                            : "Aucun collaborateur pour ce filtre."}
                        </td>
                      </tr>
                    ) : (
                      lignesFiltrees.map((c, i) => {
                        const s = statutCible(c);
                        return (
                          <tr
                            key={c.id}
                            className="results-row border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-surface-2/50"
                            style={{
                              animationDelay: `${Math.min(i, 12) * 30}ms`,
                            }}
                          >
                            <td className="max-w-[16rem] px-5 py-3.5">
                              <p className="truncate text-[13.5px] font-medium text-foreground">
                                {c.prenom}
                              </p>
                              <p className="truncate font-mono text-[11.5px] text-faint">
                                {c.email}
                              </p>
                            </td>
                            <td className="px-3 py-3.5 whitespace-nowrap">
                              <BadgeStatut statut={s} />
                            </td>
                            <td className="tabular px-5 py-3.5 text-right text-[13px] text-foreground">
                              {c.quiz_complete
                                ? c.score_quiz !== null
                                  ? `${c.score_quiz}/100`
                                  : "OK"
                                : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="flex gap-2 sm:hidden">
        <button
          type="button"
          className={buttonSecondary}
          disabled={exportEnCours !== null}
          onClick={() => exporterCsv()}
        >
          CSV
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={exportEnCours !== null}
          onClick={() => exporterExcel()}
        >
          Excel
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={exportEnCours !== null}
          onClick={() => void exporterPdf()}
        >
          PDF
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Compte de 0 à la cible (respecte prefers-reduced-motion). */
function useCountUp(cible: number, dureeMs = 850): number {
  const [valeur, setValeur] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValeur(cible);
      return;
    }

    let debut: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (debut === null) debut = t;
      const p = Math.min(1, (t - debut) / dureeMs);
      const eased = 1 - (1 - p) ** 3;
      setValeur(Math.round(cible * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cible, dureeMs]);

  return valeur;
}

function KpiCard({
  index,
  label,
  value,
  suffix,
  detail,
  pct,
  tone,
  featured,
  icon,
}: {
  index: number;
  label: string;
  value: number;
  suffix?: string;
  detail: string;
  pct: number;
  tone: "danger" | "warning" | "success" | "accent" | "neutral";
  featured?: boolean;
  icon: ReactNode;
}) {
  const affiche = useCountUp(value);
  const [barrePret, setBarrePret] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setBarrePret(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const couleurChiffre =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : tone === "accent"
            ? "text-accent-text"
            : "text-foreground";

  const couleurBarre =
    tone === "danger"
      ? "bg-danger"
      : tone === "warning"
        ? "bg-warning"
        : tone === "success"
          ? "bg-success"
          : tone === "accent"
            ? "bg-accent"
            : "bg-border-strong";

  return (
    <article
      className={`results-kpi results-kpi-${index} relative overflow-hidden rounded-xl border px-4 py-4 transition-colors duration-200 ${
        featured
          ? "border-accent-line bg-surface shadow-[0_0_0_1px_rgba(14,133,147,0.12),0_8px_28px_-16px_rgba(14,133,147,0.45)]"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      {featured && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(14,133,147,0.14),transparent_55%)]"
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[12px] text-muted">{label}</p>
        <span className="text-faint">{icon}</span>
      </div>
      <p
        className={`relative tabular mt-2.5 text-[28px] font-semibold leading-none tracking-[-0.03em] ${couleurChiffre}`}
      >
        {affiche}
        {suffix ? (
          <span className="text-[15px] font-medium text-faint">{suffix}</span>
        ) : null}
      </p>
      <div className="relative mt-3.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`results-bar-fill h-full rounded-full ${couleurBarre}`}
          style={{
            width: barrePret ? `${Math.min(Math.max(pct, 0), 100)}%` : "0%",
          }}
        />
      </div>
      <p className="relative mt-2 text-[12px] text-faint">{detail}</p>
    </article>
  );
}

function ScoreRing({
  pourcentage,
  ton,
}: {
  pourcentage: number;
  ton: "danger" | "warning" | "ok";
}) {
  const rayon = 48;
  const circonference = 2 * Math.PI * rayon;
  const [pret, setPret] = useState(false);
  const affiche = useCountUp(pourcentage);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPret(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const offset = pret
    ? circonference * (1 - Math.min(Math.max(pourcentage, 0), 100) / 100)
    : circonference;

  const gradientId = "ring-risk-grad";

  return (
    <div className="relative h-[132px] w-[132px]">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5ecad4" />
            <stop
              offset="100%"
              stopColor={
                ton === "danger"
                  ? "#f0616d"
                  : ton === "warning"
                    ? "#e8b44a"
                    : "#0e8593"
              }
            />
          </linearGradient>
        </defs>
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          strokeWidth="7"
          className="stroke-surface-3"
        />
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circonference}
          strokeDashoffset={offset}
          className="results-ring-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="tabular text-[28px] font-semibold leading-none tracking-[-0.04em] text-foreground">
          {affiche}
          <span className="text-[13px] font-medium text-faint">%</span>
        </p>
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
          clics
        </p>
      </div>
    </div>
  );
}

function RepartitionLigne({
  label,
  valeur,
  total,
  tone,
}: {
  label: string;
  valeur: number;
  total: number;
  tone: "success" | "danger" | "neutre";
}) {
  const pct = pourcent(valeur, total);
  const [pret, setPret] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPret(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const barre =
    tone === "success"
      ? "bg-success"
      : tone === "danger"
        ? "bg-danger"
        : "bg-border-strong";
  const texte =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-muted";

  return (
    <li>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className={`tabular font-medium ${texte}`}>
          {pct}%{" "}
          <span className="font-normal text-faint">
            {valeur}/{total}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`results-bar-fill h-full rounded-full ${barre}`}
          style={{
            width: pret ? `${valeur > 0 ? Math.max(pct, 2) : 0}%` : "0%",
          }}
        />
      </div>
    </li>
  );
}

function BadgeStatut({ statut }: { statut: StatutLigne }) {
  if (statut === "signale") {
    return (
      <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
        A signalé
      </span>
    );
  }
  if (statut === "piege") {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-medium text-danger">
        Piégé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-faint">
      Aucune action
    </span>
  );
}

function IconClick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h4l2-7 3 14 2-7h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconQuiz() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3 19c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16 19c0-1.5 1-2.8 2.5-3.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function csvEscape(valeur: string): string {
  if (/[;"\n]/.test(valeur)) return `"${valeur.replace(/"/g, '""')}"`;
  return valeur;
}

function slugifier(texte: string): string {
  return (
    texte
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "campagne"
  );
}
