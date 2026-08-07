/**
 * Aperçu statique de l'application pour la landing.
 * Contenu illustratif : ne reflète aucune donnée réelle.
 */
import {
  IconCampaign,
  IconDashboard,
  IconUsers,
} from "@/components/icons";

const NAV = [
  { label: "Tableau de bord", Icon: IconDashboard, active: false },
  { label: "Employés", Icon: IconUsers, active: false },
  { label: "Campagnes", Icon: IconCampaign, active: true },
];

const METRICS = [
  { label: "Messages envoyés", value: "24", detail: "Service comptabilité" },
  { label: "Ont cliqué", value: "7", detail: "29 % des destinataires" },
  { label: "Ont signalé", value: "11", detail: "46 % des destinataires" },
];

const RESULTS = [
  { prenom: "Sophie", statut: "clique", formation: "Terminée" },
  { prenom: "Marc", statut: "signale", formation: "—" },
  { prenom: "Amine", statut: "clique", formation: "En cours" },
  { prenom: "Claire", statut: "signale", formation: "—" },
  { prenom: "Thomas", statut: "aucune", formation: "—" },
];

export function AppPreview() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_40px_90px_-45px_rgba(0,0,0,0.95)]">
      {/* Chrome de fenêtre */}
      <div className="flex items-center gap-3 border-b border-border bg-surface-2/70 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
        </span>
        <span className="mx-auto rounded-[5px] border border-border bg-background px-3 py-1 font-mono text-[11px] text-faint">
          app.safentreprise.fr/campagnes
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[168px_1fr]">
        {/* Navigation */}
        <div className="hidden flex-col gap-0.5 border-r border-border bg-surface-2/40 p-3 sm:flex">
          {NAV.map(({ label, Icon, active }) => (
            <span
              key={label}
              className={`flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12px] ${
                active
                  ? "bg-accent-soft text-accent-text"
                  : "text-faint"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </span>
          ))}
        </div>

        {/* Contenu */}
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-semibold text-foreground">
                Arnaque au président
              </p>
              <p className="mt-0.5 text-[11.5px] text-faint">
                Campagne du 12 mars · Canal email
              </p>
            </div>
            <span className="rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
              Terminée
            </span>
          </div>

          {/* Indicateurs */}
          <div className="mt-5 grid gap-px overflow-hidden rounded-[8px] border border-border bg-border sm:grid-cols-3">
            {METRICS.map((metric) => (
              <div key={metric.label} className="bg-surface px-4 py-3.5">
                <p className="text-[11.5px] text-muted">{metric.label}</p>
                <p className="tabular mt-1.5 text-[22px] font-semibold leading-none text-foreground">
                  {metric.value}
                </p>
                <p className="mt-1.5 text-[11px] text-faint">{metric.detail}</p>
              </div>
            ))}
          </div>

          {/* Résultats par collaborateur */}
          <div className="mt-5 overflow-hidden rounded-[8px] border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border bg-surface-2/50 px-4 py-2 text-[10.5px] uppercase tracking-wider text-faint">
              <span>Collaborateur</span>
              <span>Résultat</span>
              <span className="w-16 text-right">Formation</span>
            </div>
            {RESULTS.map((row) => (
              <div
                key={row.prenom}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2.5 text-[12px] last:border-0"
              >
                <span className="text-foreground">{row.prenom}</span>
                <StatusPill statut={row.statut} />
                <span className="w-16 text-right text-faint">
                  {row.formation}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ statut }: { statut: string }) {
  if (statut === "clique") {
    return (
      <span className="rounded-full border border-danger/25 bg-danger-soft px-2 py-0.5 text-[10.5px] font-medium text-danger">
        A cliqué
      </span>
    );
  }
  if (statut === "signale") {
    return (
      <span className="rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-[10.5px] font-medium text-success">
        A signalé
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10.5px] text-faint">
      Sans action
    </span>
  );
}
