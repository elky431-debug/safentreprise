/**
 * Envoi d'une campagne validée.
 * - canal email → Resend
 * - canal SMS → SMS Partner
 * Une campagne « les_deux » (legacy) peut mélanger les canaux cible par cible.
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

type DetailEnvoi = {
  cibleId: string;
  canal: "email" | "sms";
  destinataire?: string;
  ok: boolean;
  detail: string;
};

function normaliserEmploye(
  raw: CibleEnvoi["employees"] | unknown,
): CibleEnvoi["employees"] {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as CibleEnvoi["employees"]) ?? null;
  return raw as CibleEnvoi["employees"];
}

/**
 * Détermine le canal concret d'une cible.
 * Campagne email/sms → canal unique ; legacy « les_deux » → heuristique contenu.
 */
function canalCible(
  canal: Campaign["canal"],
  html: string | null,
  objet: string | null,
): "email" | "sms" {
  if (canal === "email") return "email";
  if (canal === "sms") return "sms";
  // Legacy mixte : objet ou balises HTML → email, sinon SMS
  return Boolean(objet) || /<\/?[a-z]/i.test(html ?? "") ? "email" : "sms";
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

  // Réessai possible si statut « envoyee » mais aucun message réellement parti
  if (campaign.statut === "envoyee") {
    const { count } = await supabase
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("message_envoye", true);

    if ((count ?? 0) > 0) {
      return Response.json(
        { erreur: "Cette campagne a déjà des messages envoyés." },
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

  const cibles = ciblesBrutes ?? [];

  // Pré-calcule les canaux pour exiger uniquement les clés nécessaires
  const canauxPrevus = cibles.map((c) =>
    canalCible(campaign.canal, c.message_final_html, c.objet_final),
  );
  const besoinEmail = canauxPrevus.includes("email");
  const besoinSms = canauxPrevus.includes("sms");

  if (besoinEmail && !process.env.RESEND_API_KEY) {
    return Response.json(
      { erreur: "RESEND_API_KEY manquante côté serveur." },
      { status: 500 },
    );
  }

  if (besoinSms && !process.env.SMSPARTNER_API_KEY) {
    return Response.json(
      { erreur: "SMSPARTNER_API_KEY manquante côté serveur." },
      { status: 500 },
    );
  }

  if (besoinSms && !process.env.SMSPARTNER_SENDER?.trim()) {
    return Response.json(
      { erreur: "SMSPARTNER_SENDER manquant côté serveur." },
      { status: 500 },
    );
  }

  const fromEmail =
    process.env.SIMULATION_FROM_EMAIL?.trim() || "onboarding@resend.dev";

  const typeFraude: TypeFraude =
    typesFraudeDeCampagne(campaign.type_fraude)[0] ?? "president";
  const from = formaterExpediteurResend(
    typeFraude,
    company.nom_dirigeant,
    supplier?.nom ?? null,
    fromEmail,
  );

  let emailsEnvoyes = 0;
  let emailsEchecs = 0;
  let smsEnvoyes = 0;
  let smsEchecs = 0;
  const details: DetailEnvoi[] = [];

  for (const cible of cibles) {
    const employe = normaliserEmploye(cible.employees);

    if (!cible.message_final_html?.trim() || !cible.token_unique || !employe) {
      const canal = canalCible(
        campaign.canal,
        cible.message_final_html,
        cible.objet_final,
      );
      if (canal === "sms") smsEchecs += 1;
      else emailsEchecs += 1;
      details.push({
        cibleId: cible.id,
        canal,
        ok: false,
        detail: "Message, token ou employé manquant.",
      });
      continue;
    }

    const canal = canalCible(
      campaign.canal,
      cible.message_final_html,
      cible.objet_final,
    );

    // ---------- SMS ----------
    if (canal === "sms") {
      const resultat = await sendSms({
        id: cible.id,
        telephone: employe.telephone,
        message: cible.message_final_html,
        token: cible.token_unique,
      });

      if (!resultat.ok) {
        smsEchecs += 1;
        details.push({
          cibleId: cible.id,
          canal: "sms",
          destinataire: employe.telephone ?? undefined,
          ok: false,
          detail: resultat.detail,
        });
        continue;
      }

      const messageAvecLien = preparerMessagePersiste(
        cible.message_final_html,
        cible.token_unique,
      );

      const { error: errUpdate } = await supabase
        .from("campaign_targets")
        .update({
          message_final_html: messageAvecLien,
          message_envoye: true,
          envoye_at: new Date().toISOString(),
        })
        .eq("id", cible.id);

      if (errUpdate) {
        console.error("Maj message_envoye (SMS) :", errUpdate);
      }

      smsEnvoyes += 1;
      details.push({
        cibleId: cible.id,
        canal: "sms",
        destinataire: employe.telephone ?? undefined,
        ok: true,
        detail: String(resultat.messageId),
      });
      continue;
    }

    // ---------- Email ----------
    const lien = urlTracking(cible.token_unique);
    const lienSignaler = urlSignalement(cible.token_unique);
    const html = injecterLiensSuivi(
      cible.message_final_html,
      lien,
      lienSignaler,
    );

    if (
      html.includes("{lien_tracking}") ||
      html.includes("{lien_signalement}")
    ) {
      emailsEchecs += 1;
      details.push({
        cibleId: cible.id,
        canal: "email",
        destinataire: employe.email,
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
      emailsEchecs += 1;
      console.error(
        `Envoi email cible ${cible.id} → ${employe.email}:`,
        resultat.erreur,
      );
      details.push({
        cibleId: cible.id,
        canal: "email",
        destinataire: employe.email,
        ok: false,
        detail: resultat.erreur,
      });
      continue;
    }

    const { error: errUpdate } = await supabase
      .from("campaign_targets")
      .update({
        message_final_html: html,
        message_envoye: true,
        envoye_at: new Date().toISOString(),
      })
      .eq("id", cible.id);

    if (errUpdate) {
      console.error("Maj message_envoye (email) :", errUpdate);
    }

    emailsEnvoyes += 1;
    details.push({
      cibleId: cible.id,
      canal: "email",
      destinataire: employe.email,
      ok: true,
      detail: resultat.id,
    });
  }

  const envoyes = emailsEnvoyes + smsEnvoyes;
  const echecs = emailsEchecs + smsEchecs;

  const resume = {
    envoyes,
    echecs,
    emails: { envoyes: emailsEnvoyes, echecs: emailsEchecs },
    sms: { envoyes: smsEnvoyes, echecs: smsEchecs },
    details,
  };

  if (envoyes === 0) {
    const premierEchec = details.find((d) => !d.ok)?.detail;
    return Response.json(
      {
        erreur:
          echecs > 0
            ? `Aucun message envoyé. ${premierEchec ?? "Erreur d'envoi."}`
            : "Aucune cible à envoyer.",
        ...resume,
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
        ...resume,
      },
      { status: 500 },
    );
  }

  try {
    const { persisterScoreHistory } = await import("@/lib/risk-dynamique");
    await persisterScoreHistory(supabase, campaign.company_id);
  } catch (e) {
    console.error("Snapshot score après envoi :", e);
  }

  return Response.json(resume);
}

/** Version lisible du SMS avec lien injecté (audit / debug en base). */
function preparerMessagePersiste(message: string, token: string): string {
  const lien = urlTracking(token);
  let texte = message;
  if (texte.includes("{lien_tracking}")) {
    texte = texte.split("{lien_tracking}").join(lien);
  } else if (!texte.includes(lien)) {
    texte = `${texte.trim()}\n${lien}`;
  }
  if (texte.includes("{lien_signalement}")) {
    texte = texte.split("{lien_signalement}").join(`${lien}?action=signaler`);
  }
  return texte;
}
