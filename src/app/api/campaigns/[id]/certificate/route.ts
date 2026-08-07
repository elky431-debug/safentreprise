/**
 * Génère l'attestation PDF d'une campagne envoyée, l'uploade dans Storage
 * (bucket certificates) et enregistre / met à jour la ligne certificates.
 *
 * POST /api/campaigns/[id]/certificate
 */
import { createClient } from "@/lib/supabase/server";
import { genererPdfAttestation } from "@/lib/certificates/pdf";

function pourcent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
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

  // Campagne (RLS : société du user uniquement)
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, company_id, nom, statut")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) {
    return Response.json({ erreur: "Campagne introuvable." }, { status: 404 });
  }

  if (campaign.statut !== "envoyee") {
    return Response.json(
      {
        erreur:
          "L'attestation n'est disponible que pour une campagne au statut « envoyée ».",
      },
      { status: 400 },
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, nom")
    .eq("id", campaign.company_id)
    .maybeSingle();

  if (!company) {
    return Response.json({ erreur: "Société introuvable." }, { status: 404 });
  }

  const { data: cibles } = await supabase
    .from("campaign_targets")
    .select("a_clique, a_signale, quiz_complete")
    .eq("campaign_id", campaign.id);

  const total = cibles?.length ?? 0;
  const pieges =
    cibles?.filter((c) => c.a_clique && !c.a_signale).length ?? 0;
  const signales = cibles?.filter((c) => c.a_signale).length ?? 0;
  const quizOk = cibles?.filter((c) => c.quiz_complete).length ?? 0;

  const dateEmission = new Date();
  const pdfBytes = await genererPdfAttestation({
    nomSociete: company.nom,
    nomCampagne: campaign.nom,
    dateEmission,
    tauxClic: pourcent(pieges, total),
    tauxSignalement: pourcent(signales, total),
    tauxQuiz: pourcent(quizOk, total),
    nbCibles: total,
  });

  // Chemin : {company_id}/{campaign_id}.pdf — requis par la policy Storage
  const chemin = `${company.id}/${campaign.id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("certificates")
    .upload(chemin, pdfBytes, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    console.error("Upload certificat :", uploadError);
    return Response.json(
      { erreur: "Le dépôt du PDF a échoué. Vérifiez le bucket certificates." },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from("certificates")
    .getPublicUrl(chemin);
  const urlPdf = urlData.publicUrl;

  // Une attestation par campagne : mise à jour si déjà existante
  const { data: existant } = await supabase
    .from("certificates")
    .select("id")
    .eq("campaign_id", campaign.id)
    .maybeSingle();

  if (existant) {
    const { error } = await supabase
      .from("certificates")
      .update({
        url_pdf: urlPdf,
        date_emission: dateEmission.toISOString(),
      })
      .eq("id", existant.id);

    if (error) {
      console.error("Update certificat :", error);
      return Response.json(
        { erreur: "L'enregistrement de l'attestation a échoué." },
        { status: 500 },
      );
    }
  } else {
    const { error } = await supabase.from("certificates").insert({
      company_id: company.id,
      campaign_id: campaign.id,
      date_emission: dateEmission.toISOString(),
      url_pdf: urlPdf,
    });

    if (error) {
      console.error("Insert certificat :", error);
      return Response.json(
        { erreur: "L'enregistrement de l'attestation a échoué." },
        { status: 500 },
      );
    }
  }

  return Response.json({ url_pdf: urlPdf });
}
