/**
 * Recalcule le score dynamique après une action publique (quiz)
 * et enregistre un point dans score_history via RPC sécurisée.
 *
 * POST /api/risk/snapshot-from-token  { token: string }
 */
import { createClient } from "@/lib/supabase/server";
import {
  calculerScoreDynamique,
  type CiblePourScore,
} from "@/lib/risk-dynamique";

type Payload = {
  company_id: string;
  assessment: {
    score_procedures: number;
    score_humain: number;
    score_technique: number;
  } | null;
  employee_ids: string[];
  cibles: CiblePourScore[];
  derniere_campagne_at: string | null;
};

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return Response.json({ erreur: "JSON invalide." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return Response.json({ erreur: "Token manquant." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_risk_payload_by_token", {
    p_token: token,
  });

  if (error || !data) {
    console.error("get_risk_payload_by_token :", error);
    return Response.json({ erreur: "Contexte introuvable." }, { status: 404 });
  }

  const payload = data as Payload;
  const score = calculerScoreDynamique({
    procedures: payload.assessment?.score_procedures ?? 0,
    technique: payload.assessment?.score_technique ?? 0,
    humainQuestionnaire: payload.assessment?.score_humain ?? 100,
    aQuestionnaire: Boolean(payload.assessment),
    employeeIds: payload.employee_ids ?? [],
    cibles: (payload.cibles ?? []).map((c) => ({
      employee_id: c.employee_id,
      message_envoye: Boolean(c.message_envoye),
      a_clique: Boolean(c.a_clique),
      a_signale: Boolean(c.a_signale),
      quiz_complete: Boolean(c.quiz_complete),
      score_quiz: c.score_quiz,
    })),
    derniereCampagneAt: payload.derniere_campagne_at,
  });

  const { error: snapError } = await supabase.rpc("snapshot_score_from_token", {
    p_token: token,
    p_score_global: score.global,
    p_score_humain: score.humain,
  });

  if (snapError) {
    console.error("snapshot_score_from_token :", snapError);
    return Response.json(
      { erreur: "Historique non enregistré.", score },
      { status: 500 },
    );
  }

  return Response.json({
    score_global: score.global,
    score_humain: score.humain,
  });
}
