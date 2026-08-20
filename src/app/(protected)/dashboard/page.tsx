import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import {
  ActiviteExtension,
  type MenacePourGraphique,
} from "@/components/dashboard/ActiviteExtension";
import { NiveauBadge } from "@/components/menaces/MenacesTable";
import {
  IconArrowRight,
  IconCampaign,
  IconPlus,
  IconShieldCheck,
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
import { appliquerExtensionAuScore } from "@/lib/risk-extension";
import type { Campaign, Company, MenaceDetectee } from "@/lib/types";
import { STATUT_LABELS } from "@/lib/campaigns";

/** Menaces chargées pour alimenter la courbe (les plus récentes). */
const LIMITE_MENACES = 2000;

/** Tableau de bord — activité de l'extension, score dynamique, campagnes. */
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
    { data: menaceRows },
    { data: activationRows },
    scoreDynamique,
  ] = await Promise.all([
    supabase.from("employees").select("id").eq("company_id", company.id),
    supabase
      .from("campaigns")
      .select("id, nom, statut, created_at, campaign_targets(id, message_final_html)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("menaces_detectees")
      .select(
        "id, detecte_at, niveau_risque, score, expediteur_nom, expediteur_email, objet",
      )
      .eq("company_id", company.id)
      .order("detecte_at", { ascending: false })
      .limit(LIMITE_MENACES),
    // La RLS restreint déjà à la société ; le filtre garde l'index utilisable.
    supabase
      .from("activations_extension")
      .select("employe_email")
      .eq("company_id", company.id),
    chargerScoreDynamique(supabase, company.id),
  ]);

  type CampagneListe = Pick<Campaign, "id" | "nom" | "statut" | "created_at"> & {
    campaign_targets: { id: string; message_final_html: string | null }[] | null;
  };
  type MenaceListe = Pick<
    MenaceDetectee,
    | "id"
    | "detecte_at"
    | "niveau_risque"
    | "score"
    | "expediteur_nom"
    | "expediteur_email"
    | "objet"
  >;

  const campaigns = (campaignRows ?? []) as CampagneListe[];
  const menaces = (menaceRows ?? []) as MenaceListe[];
  const employes = employeeRows?.length ?? 0;
  // Le compteur porte sur des PERSONNES, pas sur des lignes : depuis que la
  // clé d'unicité est le poste, un collaborateur équipé de deux machines
  // occupe deux lignes et ne doit être compté qu'une fois.
  const activations = new Set(
    (activationRows ?? [])
      .map((a) => (a.employe_email as string | null)?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  ).size;

  // Le graphique n'a besoin que de la date et du niveau : on n'envoie pas le
  // reste au client.
  const menacesGraphique: MenacePourGraphique[] = menaces.map((m) => ({
    id: m.id,
    detecte_at: m.detecte_at,
    niveau_risque: m.niveau_risque,
  }));

  // Score : l'axe technique est allégé à proportion du déploiement.
  const scores = scoreDynamique.aQuestionnaire
    ? appliquerExtensionAuScore({
        procedures: scoreDynamique.procedures,
        humain: scoreDynamique.humain,
        techniqueBase: scoreDynamique.technique,
        activations,
        employes,
      })
    : null;

  const couverturePct = Math.round(
    (employes > 0 ? Math.min(1, activations / employes) : 0) * 100,
  );

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

      {/* Indicateurs + courbe, pilotés par le sélecteur de période */}
      <ActiviteExtension
        menaces={menacesGraphique}
        employes={employes}
        activations={activations}
        scoreGlobal={scores ? scores.global : null}
        libelleNiveauScore={
          scores ? RISK_LEVEL_LABELS[riskLevel(scores.global)] : ""
        }
      />

      {/* Taux d'exposition — l'axe technique intègre la couverture */}
      <section>
        <article className="rounded-xl border border-border bg-surface">
          <div className="px-5 pt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
              Répartition
            </p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-foreground">
              Taux d&apos;exposition
            </h2>
          </div>

          {scores ? (
            <div className="flex flex-col items-center gap-6 px-5 py-5 lg:flex-row lg:items-center">
              <RiskRing
                pourcentage={scores.global}
                label={RISK_LEVEL_LABELS[riskLevel(scores.global)]}
              />

              <ul className="w-full min-w-0 space-y-3.5">
                {RISK_CATEGORY_ORDER.map((categorie, index) => (
                  <li
                    key={categorie}
                    className="flex items-start justify-between gap-3"
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
                        {categorie === "technique" &&
                          scores.reductionTechnique > 0 && (
                            <span className="text-[10px] font-normal uppercase tracking-wide text-success">
                              −{scores.reductionTechnique}
                            </span>
                          )}
                      </span>

                      <span className="mt-0.5 block pl-3.5 text-[11.5px] leading-snug text-faint">
                        {categorie === "humain"
                          ? "Moyenne des collaborateurs (campagnes + inactivité)"
                          : categorie === "technique" &&
                              scores.reductionTechnique > 0
                            ? `Renforcé par l'extension (${couverturePct} % de couverture)`
                            : RISK_CATEGORY_HINTS[categorie]}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="tabular block text-[13px] font-semibold text-foreground">
                        {scores[categorie]}&nbsp;%
                      </span>
                      {categorie === "technique" &&
                        scores.reductionTechnique > 0 && (
                          <span className="tabular block text-[11px] text-faint line-through">
                            {scores.techniqueBase}&nbsp;%
                          </span>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-5 py-10 text-[13px] text-muted">
              Aucune évaluation disponible — complétez le questionnaire de
              risque pour afficher le taux d&apos;exposition.
            </p>
          )}

          {scores && scores.reductionTechnique > 0 && (
            <div className="border-t border-border px-5 py-3.5">
              <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
                <IconShieldCheck className="h-3.5 w-3.5 text-success" />
                Sans l&apos;extension, le score global serait de{" "}
                <span className="tabular font-medium text-foreground">
                  {scores.globalSansExtension}&nbsp;%
                </span>
                <span className="tabular font-medium text-success">
                  (−{scores.globalSansExtension - scores.global} pts)
                </span>
              </p>
            </div>
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

      {/* Dernières alertes remontées par l'extension */}
      <section>
        <article className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">
                Menaces récentes
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Dernières tentatives interceptées sur les boîtes mail
              </p>
            </div>
            <Link
              href="/menaces"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground hover:underline"
            >
              Voir tout
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {menaces.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted">
                <IconShieldCheck />
              </span>
              <p className="mt-3 text-[13.5px] font-medium text-foreground">
                Aucune tentative détectée
              </p>
              <p className="mt-1.5 max-w-sm text-[12.5px] text-muted">
                Les alertes apparaîtront ici dès que vos collaborateurs auront
                activé l&apos;extension.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {menaces.slice(0, 5).map((menace) => (
                <li
                  key={menace.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-2/40"
                >
                  <span className="tabular w-[86px] shrink-0 text-[12px] text-faint">
                    {formatDateCourt(menace.detecte_at)}
                  </span>

                  <span className="min-w-[160px] flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {menace.expediteur_nom || menace.expediteur_email}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-muted">
                      {menace.expediteur_email}
                    </span>
                  </span>

                  <span className="min-w-[140px] flex-1 truncate text-[12.5px] text-muted">
                    {menace.objet || "—"}
                  </span>

                  <NiveauBadge
                    niveau={menace.niveau_risque}
                    score={menace.score}
                  />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
          className="results-ring-arc stroke-accent-text"
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
