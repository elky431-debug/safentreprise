import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Panel, PanelHeader, buttonPrimary } from "@/components/ui";
import { IconCampaign, IconPlus } from "@/components/icons";
import { StatutBadge } from "@/components/campaigns/StatutBadge";
import { formatDateCourte, resumeCampagne } from "@/lib/campaigns";
import type { Campaign, Company } from "@/lib/types";

/** Liste des campagnes de simulation de la société. */
export default async function CampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle<Pick<Company, "id">>();

  if (!company) {
    return null;
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .returns<Campaign[]>();

  const liste = campaigns ?? [];
  const identifiants = liste.map((campagne) => campagne.id);

  const { data: cibles } =
    identifiants.length > 0
      ? await supabase
          .from("campaign_targets")
          .select("campaign_id, message_final_html")
          .in("campaign_id", identifiants)
      : { data: [] };

  const nbCibles = compterParCampagne(cibles);
  const nbMessages = compterMessagesComposes(cibles);

  return (
    <div className="w-full">
      <PageHeader
        title="Campagnes"
        description="Chaque campagne envoie de faux messages de fraude à vos collaborateurs pour mesurer leurs réflexes."
      />

      {liste.length === 0 ? (
        <div className="panel-relief flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-20 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-accent-soft text-accent-text">
            <IconCampaign />
          </span>
          <p className="mt-5 text-[15px] font-medium text-foreground">
            Aucune campagne pour le moment
          </p>
          <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
            Choisissez un scénario, personnalisez votre charte, et composez les
            messages à partir des gabarits.
          </p>
          <Link href="/campaigns/new" className={`${buttonPrimary} mt-6`}>
            <IconPlus />
            Nouvelle campagne
          </Link>
        </div>
      ) : (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Vos campagnes"
            action={
              <Link href="/campaigns/new" className={buttonPrimary}>
                <IconPlus />
                Nouvelle campagne
              </Link>
            }
          />

          <ul className="divide-y divide-border">
            {liste.map((campagne) => (
              <li key={campagne.id}>
                <Link
                  href={`/campaigns/${campagne.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2.5 text-[14.5px] font-medium text-foreground">
                      {campagne.nom}
                      <StatutBadge statut={campagne.statut} />
                    </p>
                    <p className="mt-1.5 text-[13px] text-muted">
                      {resumeCampagne(campagne.type_fraude, campagne.canal)}
                    </p>
                  </div>

                  <div className="tabular flex items-center gap-5 text-[12.5px] text-faint">
                    <span>
                      {nbCibles.get(campagne.id) ?? 0} cible
                      {(nbCibles.get(campagne.id) ?? 0) > 1 ? "s" : ""}
                    </span>
                    <span>
                      {nbMessages.get(campagne.id) ?? 0} message
                      {(nbMessages.get(campagne.id) ?? 0) > 1 ? "s" : ""}
                    </span>
                    <span>{formatDateCourte(campagne.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function compterParCampagne(
  lignes: { campaign_id: string }[] | null,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const { campaign_id } of lignes ?? []) {
    total.set(campaign_id, (total.get(campaign_id) ?? 0) + 1);
  }
  return total;
}

function compterMessagesComposes(
  lignes: { campaign_id: string; message_final_html: string | null }[] | null,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const { campaign_id, message_final_html } of lignes ?? []) {
    if (!message_final_html) continue;
    total.set(campaign_id, (total.get(campaign_id) ?? 0) + 1);
  }
  return total;
}
