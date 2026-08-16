import { createClient } from "@/lib/supabase/server";
import { TrackingExperience } from "@/components/tracking/TrackingExperience";
import { SignalementBravo } from "@/components/tracking/SignalementBravo";
import { mapQuizRow, type QuizRpcRow } from "@/lib/quiz";
import type { TypeFraude } from "@/lib/types";

type RpcCible = {
  target_id: string;
  token_unique: string;
  prenom: string;
  type_fraude: string;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
};

/**
 * Page publique de tracking — hors layout (protected).
 * - ?action=signaler → bon réflexe (pas de clic piégé)
 * - sinon → marque le clic + pédagogie + quiz
 */
export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const { action } = await searchParams;
  const signaler = action === "signaler";
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc("get_target_by_token", {
    p_token: token,
  });

  const liste = (rows ?? []) as RpcCible[];
  const cible = Array.isArray(liste) ? liste[0] : (liste as unknown as RpcCible);

  if (error || !cible?.token_unique) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            Lien invalide ou expiré
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Ce lien de simulation n&apos;existe pas ou n&apos;est plus actif.
            Contactez votre responsable sécurité interne si besoin.
          </p>
        </div>
      </div>
    );
  }

  // Bon réflexe : signalement uniquement (on ne marque PAS le clic)
  if (signaler) {
    if (!cible.a_signale) {
      await supabase.rpc("marquer_signalement", { p_token: token });
      cible.a_signale = true;
    }
    return <SignalementBravo prenom={cible.prenom} />;
  }

  // Clic sur le lien piégé
  if (!cible.a_clique) {
    await supabase.rpc("marquer_clic", { p_token: token });
    cible.a_clique = true;
  }

  const typeFraude: TypeFraude =
    cible.type_fraude === "fournisseur" ? "fournisseur" : "president";

  // Questions depuis quiz_questions (RPC publique, champs minimaux).
  // Le jeton sert à résoudre la société : le collaborateur reçoit les
  // questions système ET celles ajoutées par son entreprise.
  const { data: quizRows } = await supabase.rpc("get_quiz_questions", {
    p_type_fraude: typeFraude,
    p_token: token,
  });
  const questions = ((quizRows ?? []) as QuizRpcRow[]).map(mapQuizRow);

  return (
    <TrackingExperience
      token={token}
      questions={questions}
      cible={{
        target_id: cible.target_id,
        token_unique: cible.token_unique,
        prenom: cible.prenom,
        type_fraude: typeFraude,
        a_clique: true,
        a_signale: cible.a_signale,
        quiz_complete: cible.quiz_complete,
        score_quiz: cible.score_quiz,
      }}
    />
  );
}
