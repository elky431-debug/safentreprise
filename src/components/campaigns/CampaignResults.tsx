import Link from "next/link";
import { resumeCampagne } from "@/lib/campaigns";
import type { Campaign } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/ui";
import { StatutBadge } from "@/components/campaigns/StatutBadge";

export type LigneResultat = {
  id: string;
  prenom: string;
  email: string;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
  message_envoye: boolean;
};

type Props = {
  campaign: Campaign;
  cibles: LigneResultat[];
};

/** Statut métier affiché : signalement > clic > neutre. */
export function statutCible(c: LigneResultat): "signale" | "piege" | "neutre" {
  if (c.a_signale) return "signale";
  if (c.a_clique) return "piege";
  return "neutre";
}

function pourcent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Tableau de bord résultats d'une campagne envoyée.
 * Basé uniquement sur a_clique / a_signale / quiz (pas d'ouverture ni suppression).
 */
export function CampaignResults({ campaign, cibles }: Props) {
  const total = cibles.length;
  const pieges = cibles.filter((c) => statutCible(c) === "piege").length;
  const signales = cibles.filter((c) => statutCible(c) === "signale").length;
  const quizOk = cibles.filter((c) => c.quiz_complete).length;

  const tauxClic = pourcent(pieges, total);
  const tauxSignalement = pourcent(signales, total);
  const tauxQuiz = pourcent(quizOk, total);

  return (
    <div className="w-full">
      <header className="mb-9">
        <Link
          href="/campaigns"
          className="text-[12.5px] text-muted transition-colors hover:text-foreground"
        >
          ← Campagnes
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
          {campaign.nom}
          <StatutBadge statut={campaign.statut} />
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Résultats · {resumeCampagne(campaign.type_fraude, campaign.canal)} ·{" "}
          {total} collaborateur(s)
        </p>
      </header>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Taux de clic"
          hint="Piégés (ont cliqué le lien)"
          valeur={`${tauxClic}%`}
          detail={`${pieges} / ${total}`}
          tone="danger"
        />
        <Kpi
          label="Taux de signalement"
          hint="Bons réflexes"
          valeur={`${tauxSignalement}%`}
          detail={`${signales} / ${total}`}
          tone="success"
        />
        <Kpi
          label="Quiz complété"
          hint="Parmi les ciblés"
          valeur={`${tauxQuiz}%`}
          detail={`${quizOk} / ${total}`}
          tone="accent"
        />
      </div>

      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Détail par collaborateur"
          description="Priorité : signalé > piégé > aucune action. Pas de détection d'ouverture ni de suppression."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-5 py-3 font-medium">Collaborateur</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Quiz</th>
                <th className="px-5 py-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cibles.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-muted"
                  >
                    Aucune cible sur cette campagne.
                  </td>
                </tr>
              ) : (
                cibles.map((c) => {
                  const s = statutCible(c);
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/30">
                      <td className="px-5 py-3.5 font-medium text-foreground">
                        {c.prenom}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[12.5px] text-muted">
                        {c.email}
                      </td>
                      <td className="px-5 py-3.5">
                        <BadgeStatut statut={s} />
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {c.quiz_complete ? "Oui" : "Non"}
                      </td>
                      <td className="tabular px-5 py-3.5 text-right text-foreground">
                        {c.score_quiz !== null ? `${c.score_quiz}` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  hint,
  valeur,
  detail,
  tone,
}: {
  label: string;
  hint: string;
  valeur: string;
  detail: string;
  tone: "danger" | "success" | "accent";
}) {
  const couleur =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : "text-accent-text";

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      <p className={`tabular mt-2 text-[28px] font-semibold tracking-[-0.04em] ${couleur}`}>
        {valeur}
      </p>
      <p className="mt-1 text-[12.5px] text-muted">
        {hint} · {detail}
      </p>
    </div>
  );
}

function BadgeStatut({
  statut,
}: {
  statut: "signale" | "piege" | "neutre";
}) {
  if (statut === "signale") {
    return (
      <span className="inline-flex rounded-md border border-success/25 bg-success-soft px-2 py-0.5 text-[12px] font-medium text-success">
        A signalé
      </span>
    );
  }
  if (statut === "piege") {
    return (
      <span className="inline-flex rounded-md border border-danger/25 bg-danger-soft px-2 py-0.5 text-[12px] font-medium text-danger">
        Piégé
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-faint">
      Aucune action
    </span>
  );
}
