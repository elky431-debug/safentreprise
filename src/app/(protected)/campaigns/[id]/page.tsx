import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignPreview } from "@/components/campaigns/CampaignPreview";
import {
  CampaignResults,
  type LigneResultat,
} from "@/components/campaigns/CampaignResults";
import type { MessageApercu } from "@/components/campaigns/MessageMockup";
import type {
  Campaign,
  CanalMessage,
  Company,
  Supplier,
  TypeFraude,
} from "@/lib/types";
import { typesFraudeDeCampagne } from "@/lib/campaigns";

type CibleLue = {
  id: string;
  employee_id: string;
  message_final_html: string | null;
  objet_final: string | null;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
  message_envoye: boolean;
  employees: {
    prenom: string;
    email: string;
    telephone: string | null;
  } | null;
};

function canalAffiche(
  canalCampagne: Campaign["canal"],
  html: string,
  objet: string | null,
): CanalMessage {
  if (canalCampagne === "email" || canalCampagne === "sms") {
    return canalCampagne;
  }
  if (objet || /<\/?[a-z][\s\S]*>/i.test(html)) return "email";
  return "sms";
}

function normaliserEmploye(
  raw: CibleLue["employees"] | unknown,
): CibleLue["employees"] {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as CibleLue["employees"]) ?? null;
  return raw as CibleLue["employees"];
}

/** Aperçu (brouillon/prête) ou résultats (envoyée). */
export default async function CampaignPage({
  params,
}: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle<Campaign>();

  if (!campaign) {
    notFound();
  }

  const [{ data: cibles }, { data: supplier }, { data: suppliers }, { data: certificat }] =
    await Promise.all([
      supabase
        .from("campaign_targets")
        .select(
          "id, employee_id, message_final_html, objet_final, a_clique, a_signale, quiz_complete, score_quiz, message_envoye, employees(prenom, email, telephone)",
        )
        .eq("campaign_id", campaign.id)
        .returns<CibleLue[]>(),
      campaign.supplier_id
        ? supabase
            .from("suppliers")
            .select("*")
            .eq("id", campaign.supplier_id)
            .maybeSingle<Supplier>()
        : Promise.resolve({ data: null }),
      supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", company.id)
        .order("nom", { ascending: true })
        .returns<Supplier[]>(),
      supabase
        .from("certificates")
        .select("url_pdf")
        .eq("campaign_id", campaign.id)
        .order("date_emission", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // ---- Résultats si campagne envoyée ----
  if (campaign.statut === "envoyee") {
    const lignes: LigneResultat[] = (cibles ?? []).flatMap((cible) => {
      const emp = normaliserEmploye(cible.employees);
      if (!emp) return [];
      return [
        {
          id: cible.id,
          employee_id: cible.employee_id,
          prenom: emp.prenom,
          email: emp.email,
          a_clique: cible.a_clique,
          a_signale: cible.a_signale,
          quiz_complete: cible.quiz_complete,
          score_quiz: cible.score_quiz,
          message_envoye: cible.message_envoye,
        },
      ];
    });

    return (
      <CampaignResults
        campaign={campaign}
        cibles={lignes}
        modeResultats={company.mode_resultats}
        certificatUrl={certificat?.url_pdf ?? null}
      />
    );
  }

  // ---- Aperçu / édition (brouillon ou prête) ----
  const typeFraude: TypeFraude =
    typesFraudeDeCampagne(campaign.type_fraude)[0] ?? "president";

  const messages: MessageApercu[] = (cibles ?? []).flatMap((cible) => {
    const emp = normaliserEmploye(cible.employees);
    if (!emp || !cible.message_final_html) return [];
    return [
      {
        id: cible.id,
        canal: canalAffiche(
          campaign.canal,
          cible.message_final_html,
          cible.objet_final,
        ),
        type_fraude: typeFraude,
        objet_final: cible.objet_final,
        message_final_html: cible.message_final_html,
        prenom: emp.prenom,
        email: emp.email,
        telephone: emp.telephone,
      },
    ];
  });

  return (
    <CampaignPreview
      campaign={campaign}
      company={company}
      supplier={supplier}
      suppliers={suppliers ?? []}
      initialMessages={messages}
    />
  );
}
