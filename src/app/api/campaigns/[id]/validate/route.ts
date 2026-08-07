/**
 * Validation d'une campagne.
 *
 * Pour chaque cible ayant un message_final_html : génère un token_unique
 * (tracking futur) et passe la campagne en « prête ». Aucun envoi réel.
 *
 * POST /api/campaigns/[id]/validate
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { CampaignTarget } from "@/lib/types";

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
    .select("id, statut")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) {
    return Response.json({ erreur: "Campagne introuvable." }, { status: 404 });
  }

  if (campaign.statut === "envoyee") {
    return Response.json(
      { erreur: "Cette campagne a déjà été envoyée." },
      { status: 409 },
    );
  }

  const { data: cibles } = await supabase
    .from("campaign_targets")
    .select("id, message_final_html, token_unique")
    .eq("campaign_id", campaign.id)
    .returns<
      Pick<CampaignTarget, "id" | "message_final_html" | "token_unique">[]
    >();

  if (!cibles || cibles.length === 0) {
    return Response.json(
      { erreur: "Aucun collaborateur n'est ciblé par cette campagne." },
      { status: 400 },
    );
  }

  const pretes = cibles.filter((c) => Boolean(c.message_final_html?.trim()));

  if (pretes.length === 0) {
    return Response.json(
      {
        erreur:
          "Composez les messages à partir des gabarits avant de valider.",
      },
      { status: 400 },
    );
  }

  for (const cible of pretes) {
    const token = cible.token_unique ?? randomUUID();
    const { error } = await supabase
      .from("campaign_targets")
      .update({ token_unique: token })
      .eq("id", cible.id);

    if (error) {
      console.error("Attribution token :", error);
      return Response.json(
        { erreur: "La génération des jetons de suivi a échoué." },
        { status: 500 },
      );
    }
  }

  const { error: erreurStatut } = await supabase
    .from("campaigns")
    .update({ statut: "prete" })
    .eq("id", campaign.id);

  if (erreurStatut) {
    console.error("Passage au statut prête :", erreurStatut);
    return Response.json(
      { erreur: "La campagne n'a pas pu être validée." },
      { status: 500 },
    );
  }

  return Response.json({
    attribuees: pretes.length,
    nonAttribuees: cibles.length - pretes.length,
  });
}
