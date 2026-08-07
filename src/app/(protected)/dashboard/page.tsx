import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import {
  IconArrowRight,
  IconCampaign,
  IconPlus,
  IconUsers,
} from "@/components/icons";
import {
  RISK_CATEGORY_HINTS,
  RISK_CATEGORY_LABELS,
  RISK_CATEGORY_ORDER,
  RISK_LEVEL_LABELS,
  riskLevel,
} from "@/lib/risk";
import { chargerScoreDynamique } from "@/lib/risk-dynamique";
import type { Campaign, Company, ScoreHistory } from "@/lib/types";
import { STATUT_LABELS } from "@/lib/campaigns";

/** Tableau de bord — score dynamique + activité. */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle<Company>();

  if (!company) {
    return null;
  }

  const [
    { data: employeeRows },
    { data: campaignRows },
    { data: envoisRows },
    { data: historyRows },
    scoreDynamique,
  ] = await Promise.all([
    supabase.from("employees").select("id").eq("company_id", company.id),
    supabase
      .from("campaigns")
      .select("id, nom, statut, created_at, campaign_targets(id, message_final_html)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_targets")
      .select("envoye_at")
      .eq("message_envoye", true)
      .gte("envoye_at", debutSemaineIso()),
    supabase
      .from("score_history")
      .select("id, company_id, score_global, score_humain, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true })
      .returns<ScoreHistory[]>(),
    chargerScoreDynamique(supabase, company.id),
  ]);

  type CampagneListe = Pick<Campaign, "id" | "nom" | "statut" | "created_at"> & {
    campaign_targets: { id: string; message_final_html: string | null }[] | null;
  };

  const campaigns = (campaignRows ?? []) as CampagneListe[];
  const employees = employeeRows?.length ?? 0;
  const campaignCount = campaigns.length;
  const pretes = campaigns.filter((c) => c.statut === "prete").length;
  const brouillons = campaigns.filter((c) => c.statut === "brouillon").length;

  const envoisSemaine = agregerEnvoisParJour(
    (envoisRows ?? [])
      .map((r) => r.envoye_at as string | null)
      .filter((d): d is string => Boolean(d)),
  );
  const totalEnvoisSemaine = envoisSemaine.reduce((s, j) => s + j.count, 0);

  // Score affiché = dynamique (humain recalculé) ; null si aucun questionnaire
  const scores = scoreDynamique.aQuestionnaire
    ? {
        procedures: scoreDynamique.procedures,
        humain: scoreDynamique.humain,
        technique: scoreDynamique.technique,
        global: scoreDynamique.global,
      }
    : null;

  // Courbe : historique + point courant (non persisté si déjà le dernier)
  const historique = historyRows ?? [];
  const pointsCourbe = [...historique];
  const dernier = pointsCourbe[pointsCourbe.length - 1];
  if (
    scores &&
    (!dernier ||
      dernier.score_global !== scores.global ||
      dernier.score_humain !== scores.humain)
  ) {
    pointsCourbe.push({
      id: "courant",
      company_id: company.id,
      score_global: scores.global,
      score_humain: scores.humain,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-foreground">
            Tableau de bord
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Sensibilisation à la fraude — {company.nom}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/employees" className={buttonSecondary}>
            <IconUsers />
            Collaborateurs
          </Link>
          <Link href="/campaigns/new" className={buttonPrimary}>
            <IconPlus />
            Nouvelle campagne
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Collaborateurs"
          value={String(employees)}
          detail={employees === 0 ? "Aucun en base" : "Cibles potentielles"}
        />
        <Metric
          label="Campagnes"
          value={String(campaignCount)}
          detail={`${pretes} prête${pretes !== 1 ? "s" : ""} · ${brouillons} brouillon${brouillons !== 1 ? "s" : ""}`}
        />
        <Metric
          label="Score de risque"
          value={scores ? `${scores.global}%` : "—"}
          detail={
            scores
              ? `${RISK_LEVEL_LABELS[riskLevel(scores.global)]} · dynamique`
              : "Non évalué"
          }
        />
        <Metric
          label="Envois (7 j)"
          value={String(totalEnvoisSemaine)}
          detail="E-mails de simulation"
        />
      </section>

      {/* Courbe d'évolution + répartition dynamique */}
      <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <article className="rounded-xl border border-border bg-surface">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Évolution
              </p>
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                Score global dans le temps
              </h2>
            </div>
            {scores && (
              <p className="tabular text-[12.5px] text-muted">
                Actuel {scores.global}&nbsp;%
              </p>
            )}
          </div>

          <div className="px-2 pb-2 pt-3 sm:px-4">
            {pointsCourbe.length >= 1 ? (
              <ScoreHistoryChart points={pointsCourbe} />
            ) : (
              <p className="px-3 py-16 text-center text-[13px] text-muted">
                Complétez le questionnaire ou lancez une campagne pour
                historiser le score.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-border px-5 py-3.5">
            <div>
              <p className="text-[11px] text-muted">Humain (dyn.)</p>
              <p className="tabular mt-0.5 text-[14px] font-semibold text-foreground">
                {scores ? `${scores.humain}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">Inactivité</p>
              <p className="tabular mt-0.5 text-[14px] font-semibold text-foreground">
                {scoreDynamique.semainesInactivite} sem.
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">Points historique</p>
              <p className="tabular mt-0.5 text-[14px] font-semibold text-foreground">
                {historique.length}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-surface">
          <div className="px-5 pt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
              Répartition
            </p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              Taux d&apos;exposition
            </h2>
          </div>

          {scores ? (
            <div className="flex flex-col items-center gap-5 px-5 py-5 sm:flex-row sm:items-center">
              <RiskRing
                pourcentage={scores.global}
                label={RISK_LEVEL_LABELS[riskLevel(scores.global)]}
              />
              <ul className="w-full min-w-0 space-y-3.5">
                {RISK_CATEGORY_ORDER.map((categorie, index) => (
                  <li
                    key={categorie}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                          style={{ opacity: 1 - index * 0.28 }}
                        />
                        {RISK_CATEGORY_LABELS[categorie]}
                        {categorie === "humain" && (
                          <span className="text-[10px] font-normal uppercase tracking-wide text-accent-text">
                            dyn.
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block pl-3.5 text-[11.5px] leading-snug text-faint">
                        {categorie === "humain"
                          ? "Moyenne des collaborateurs (campagnes + inactivité)"
                          : RISK_CATEGORY_HINTS[categorie]}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[13px] font-semibold text-foreground">
                      {scores[categorie]}&nbsp;%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-5 py-10 text-[13px] text-muted">
              Aucune évaluation disponible.
            </p>
          )}
        </article>
      </section>

      {/* Campagnes + société */}
      <section className="grid gap-3 lg:grid-cols-5">
        <article className="rounded-xl border border-border bg-surface lg:col-span-3">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">
                Campagnes
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Simulations en cours et prêtes
              </p>
            </div>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground hover:underline"
            >
              Voir tout
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted">
                <IconCampaign />
              </span>
              <p className="mt-3 text-[13.5px] font-medium text-foreground">
                Aucune campagne
              </p>
              <Link href="/campaigns/new" className={`${buttonPrimary} mt-4`}>
                <IconPlus />
                Créer
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {campaigns.slice(0, 5).map((campagne) => (
                <li key={campagne.id}>
                  <Link
                    href={`/campaigns/${campagne.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-foreground">
                        {campagne.nom}
                      </p>
                      <p className="mt-0.5 text-[12px] text-faint">
                        {formatDate(campagne.created_at)} ·{" "}
                        {(() => {
                          const n =
                            campagne.campaign_targets?.filter(
                              (t) => t.message_final_html,
                            ).length ?? 0;
                          return n === 1 ? "1 message" : `${n} messages`;
                        })()}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {STATUT_LABELS[campagne.statut]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-border bg-surface lg:col-span-2">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold text-foreground">
              Société
            </h2>
          </div>
          <dl className="space-y-3 px-5 py-4">
            <Detail label="Raison sociale" value={company.nom} />
            <Detail
              label="Secteur"
              value={company.secteur ?? "Non renseigné"}
            />
            <Detail label="Responsable" value={company.nom_responsable} />
            <Detail label="Email" value={company.email_responsable} />
            <Detail label="Dirigeant usurpé" value={company.nom_dirigeant} />
            <Detail
              label="Mode résultats"
              value={
                company.mode_resultats === "nominatif"
                  ? "Nominatif"
                  : "Anonymisé"
              }
            />
          </dl>
        </article>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4">
      <p className="text-[12px] text-foreground">{label}</p>
      <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-foreground">
        {value}
      </p>
      <p className="mt-2 text-[12px] text-muted">{detail}</p>
    </div>
  );
}

/** Courbe du score global (score_history + point courant). */
function ScoreHistoryChart({ points }: { points: ScoreHistory[] }) {
  const largeur = 560;
  const hauteur = 200;
  const padX = 36;
  const padY = 28;
  const zoneW = largeur - padX * 2;
  const zoneH = hauteur - padY * 2;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padX + zoneW / 2
        : padX + (i / (points.length - 1)) * zoneW;
    const y = padY + zoneH * (1 - Math.min(Math.max(p.score_global, 0), 100) / 100);
    return { x, y, ...p };
  });

  const ligne = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const aire = [
    `${coords[0].x},${padY + zoneH}`,
    ...coords.map((p) => `${p.x},${p.y}`),
    `${coords[coords.length - 1].x},${padY + zoneH}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      className="h-[200px] w-full"
      role="img"
      aria-label="Évolution du score de risque global"
    >
      {[0, 50, 100].map((seuil) => {
        const y = padY + zoneH * (1 - seuil / 100);
        return (
          <g key={seuil}>
            <line
              x1={padX}
              x2={largeur - padX}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-border"
            />
            <text
              x={padX - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-faint text-[10px]"
            >
              {seuil}
            </text>
          </g>
        );
      })}

      <polygon points={aire} className="fill-accent/15" />
      <polyline
        points={ligne}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-accent-text"
      />

      {coords.map((p) => (
        <g key={p.id}>
          <circle
            cx={p.x}
            cy={p.y}
            r="4.5"
            className="fill-background stroke-accent-text"
            strokeWidth="2"
          />
          <text
            x={p.x}
            y={hauteur - 8}
            textAnchor="middle"
            className="fill-muted text-[10px]"
          >
            {formatDateCourt(p.created_at)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function RiskRing({
  pourcentage,
  label,
}: {
  pourcentage: number;
  label: string;
}) {
  const rayon = 48;
  const circonference = 2 * Math.PI * rayon;
  const borne = Math.min(Math.max(pourcentage, 0), 100) / 100;
  const offset = circonference * (1 - borne);

  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg
        viewBox="0 0 128 128"
        className="h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-surface-3"
        />
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={offset}
          className="stroke-accent-text"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="tabular text-[28px] font-semibold leading-none tracking-[-0.04em] text-foreground">
          {pourcentage}
          <span className="text-[13px] font-medium text-foreground/70">%</span>
        </p>
        <p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-foreground">
          {label.replace(/^Risque\s+/i, "")}
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
      <dt className="text-[11.5px] text-foreground">{label}</dt>
      <dd className="truncate text-right text-[13px] text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateCourt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** ISO du début de la fenêtre (il y a 6 jours à 00:00 locale). */
function debutSemaineIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 6);
  return d.toISOString();
}

type JourEnvoi = { key: string; label: string; count: number };

/** Agrège les timestamps d'envoi en 7 jours (J-6 → aujourd'hui). */
function agregerEnvoisParJour(envoyeAts: string[]): JourEnvoi[] {
  const labels = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const jours: JourEnvoi[] = [];
  const counts = new Map<string, number>();

  for (const iso of envoyeAts) {
    const d = new Date(iso);
    const key = cleJourLocal(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(aujourdhui);
    d.setDate(aujourdhui.getDate() - i);
    const key = cleJourLocal(d);
    jours.push({
      key,
      label: labels[d.getDay()],
      count: counts.get(key) ?? 0,
    });
  }

  return jours;
}

function cleJourLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
