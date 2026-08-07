import { createClient } from "@/lib/supabase/server";
import { PageHeader, Panel, PanelHeader } from "@/components/ui";
import type { Payment } from "@/lib/types";

const STATUT_LABELS: Record<string, string> = {
  pending: "En attente",
  succeeded: "Payé",
  paid: "Payé",
  failed: "Échoué",
  canceled: "Annulé",
  cancelled: "Annulé",
};

/**
 * Facturation — historique des paiements de la société (lecture seule).
 * Pas d'intégration Stripe ici : affichage des lignes `payments` via RLS.
 */
export default async function BillingPage() {
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("id, montant, statut_stripe, created_at, campaign_id")
    .order("created_at", { ascending: false })
    .returns<
      Pick<
        Payment,
        "id" | "montant" | "statut_stripe" | "created_at" | "campaign_id"
      >[]
    >();

  const lignes = payments ?? [];

  return (
    <div className="w-full">
      <PageHeader
        title="Facturation"
        description="Historique des paiements liés à votre compte Safentreprise."
      />

      <Panel>
        <PanelHeader
          title="Paiements"
          description="Les règlements apparaissent ici une fois enregistrés. Aucune carte n'est stockée dans cette interface."
        />

        {lignes.length === 0 ? (
          <p className="px-6 py-10 text-[13.5px] text-muted">
            Aucun paiement pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Montant</th>
                  <th className="px-6 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lignes.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-3.5 text-muted">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="tabular px-6 py-3.5 font-medium text-foreground">
                      {formatMontant(p.montant)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">
                        {STATUT_LABELS[p.statut_stripe] ?? p.statut_stripe}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatMontant(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(montant));
}
