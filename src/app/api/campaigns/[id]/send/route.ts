/**
 * Envoi d'une campagne validée (emails via Resend).
 * Les cibles SMS sont ignorées côté email (stub sendSms, pas d'échec bloquant).
 *
 * POST /api/campaigns/[id]/send
 */
import { createClient } from "@/lib/supabase/server";
import { envoyerEmailSimulation } from "@/lib/send/email";
import { sendSms } from "@/lib/send/sms";
import {
  formaterExpediteurResend,
  injecterLiensSuivi,
  urlSignalement,
  urlTracking,
} from "@/lib/send/tracking";
import type {
  Campaign,
  Company,
  Supplier,
  TypeFraude,
} from "@/lib/types";
import { typesFraudeDeCampagne } from "@/lib/campaigns";

type CibleEnvoi = {
  id: string;
  message_final_html: string | null;
  objet_final: string | null;
  token_unique: string | null;
  message_envoye: boolean;
  employees: {
    prenom: string;
    email: string;
    telephone: string | null;
  } | null;
};

function normaliserEmploye(
  raw: CibleEnvoi["employees"] | unknown,
): CibleEnvoi["employees"] {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as CibleEnvoi["employees"]) ?? null;
  return raw as CibleEnvoi["employees"];
}

/** Email si canal campagne email, ou legacy mixte avec HTML. */
function estCanalEmail(
  canal: Campaign["canal"],
  html: string | null,
  objet: string | null,
): boolean {
  if (canal === "email") return true;
  if (canal === "sms") return false;
  return Boolean(objet) || /<\/?[a-z]/i.test(html ?? "");
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ erreur: "Session expirée." }, { status: 401 });
  }

  const fromEmail =
    process.env.SIMULATION_FROM_EMAIL?.trim() || "onboarding@resend.dev";

  if (!process.env.RESEND_API_KEY) {
    return Response.json(
      { erreur: "RESEND_API_KEY manquante côté serveur." },
      { status: 500 },
    );
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle<Campaign>();

  if (!campaign) {
    return Response.json({ erreur: "Campagne introuvable." }, { status: 404 });
  }

  if (campaign.statut !== "prete" && campaign.statut !== "envoyee") {
    return Response.json(
      { erreur: "Validez la campagne avant de l'envoyer." },
      { status: 409 },
    );
  }

  // Réessai possible si statut « envoyee » mais aucun email réellement parti
  if (campaign.statut === "envoyee") {
    const { count } = await supabase
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("message_envoye", true);

    if ((count ?? 0) > 0) {
      return Response.json(
        { erreur: "Cette campagne a déjà des emails envoyés." },
        { status: 409 },
      );
    }

    await supabase
      .from("campaigns")
      .update({ statut: "prete" })
      .eq("id", campaign.id);
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", campaign.company_id)
    .maybeSingle<Company>();

  if (!company) {
    return Response.json({ erreur: "Société introuvable." }, { status: 404 });
  }

  const [{ data: supplier }, { data: ciblesBrutes }] = await Promise.all([
    campaign.supplier_id
      ? supabase
          .from("suppliers")
          .select("*")
          .eq("id", campaign.supplier_id)
          .maybeSingle<Supplier>()
      : Promise.resolve({ data: null }),
    supabase
      .from("campaign_targets")
      .select(
        "id, message_final_html, objet_final, token_unique, message_envoye, employees(prenom, email, telephone)",
      )
      .eq("campaign_id", campaign.id)
      .returns<CibleEnvoi[]>(),
  ]);

  const typeFraude: TypeFraude =
    typesFraudeDeCampagne(campaign.type_fraude)[0] ?? "president";
  const from = formaterExpediteurResend(
    typeFraude,
    company.nom_dirigeant,
    supplier?.nom ?? null,
    fromEmail,
  );

  let envoyes = 0;
  let echecs = 0;
  let smsIgnores = 0;
  const details: {
    cibleId: string;
    email?: string;
    ok: boolean;
    detail: string;
  }[] = [];

  for (const cible of ciblesBrutes ?? []) {
    const employe = normaliserEmploye(cible.employees);

    if (
      !cible.message_final_html?.trim() ||
      !cible.token_unique ||
      !employe
    ) {
      echecs += 1;
      details.push({
        cibleId: cible.id,
        ok: false,
        detail: "Message, token ou employé manquant.",
      });
      continue;
    }

    const email = estCanalEmail(
      campaign.canal,
      cible.message_final_html,
      cible.objet_final,
    );

    if (!email) {
      // Canal SMS : stub, ne bloque pas l'envoi global
      await sendSms({
        id: cible.id,
        telephone: employe.telephone,
        message: cible.message_final_html,
        token: cible.token_unique,
      });
      smsIgnores += 1;
      details.push({
        cibleId: cible.id,
        ok: true,
        detail: "SMS non implémenté — ignoré.",
      });
      continue;
    }

    const lien = urlTracking(cible.token_unique);
    const lienSignaler = urlSignalement(cible.token_unique);
    const html = injecterLiensSuivi(
      cible.message_final_html,
      lien,
      lienSignaler,
    );

    // Sécurité : refuser l'envoi si des placeholders restent (lien mort)
    if (
      html.includes("{lien_tracking}") ||
      html.includes("{lien_signalement}")
    ) {
      echecs += 1;
      details.push({
        cibleId: cible.id,
        email: employe.email,
        ok: false,
        detail:
          "Liens de suivi non injectés (placeholders restants). Recomposez puis renvoyez.",
      });
      continue;
    }

    const sujet = cible.objet_final?.trim() || "Message confidentiel";

    const resultat = await envoyerEmailSimulation({
      from,
      to: employe.email,
      subject: sujet,
      html,
    });

    if (!resultat.ok) {
      echecs += 1;
      console.error(`Envoi cible ${cible.id} → ${employe.email}:`, resultat.erreur);
      details.push({
        cibleId: cible.id,
        email: employe.email,
        ok: false,
        detail: resultat.erreur,
      });
      continue;
    }

    // Persiste le HTML réellement envoyé (avec URLs) pour audit / debug
    const { error: errUpdate } = await supabase
      .from("campaign_targets")
      .update({
        message_final_html: html,
        message_envoye: true,
        envoye_at: new Date().toISOString(),
      })
      .eq("id", cible.id);

    if (errUpdate) {
      console.error("Maj message_envoye :", errUpdate);
    }

    envoyes += 1;
    details.push({
      cibleId: cible.id,
      email: employe.email,
      ok: true,
      detail: resultat.id,
    });
  }

  // Ne passe en « envoyee » que si au moins un email est parti
  if (envoyes === 0) {
    return Response.json(
      {
        erreur:
          echecs > 0
            ? `Aucun email envoyé. ${details.find((d) => !d.ok)?.detail ?? "Erreur Resend."}`
            : "Aucune cible email à envoyer.",
        envoyes,
        echecs,
        smsIgnores,
        details,
      },
      { status: 422 },
    );
  }

  const { error: errStatut } = await supabase
    .from("campaigns")
    .update({
      statut: "envoyee",
      date_lancement: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  if (errStatut) {
    console.error("Passage statut envoyee :", errStatut);
    return Response.json(
      {
        erreur: "Envois OK mais le statut n'a pas pu être mis à jour.",
        envoyes,
        echecs,
        smsIgnores,
        details,
      },
      { status: 500 },
    );
  }

  // Point d'historique du score de risque (après envoi)
  try {
    const { persisterScoreHistory } = await import("@/lib/risk-dynamique");
    await persisterScoreHistory(supabase, campaign.company_id);
  } catch (e) {
    console.error("Snapshot score après envoi :", e);
  }

  return Response.json({ envoyes, echecs, smsIgnores, details });
}
