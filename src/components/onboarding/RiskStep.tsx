"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Panel, buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import {
  RISK_CATEGORY_HINTS,
  RISK_CATEGORY_LABELS,
  RISK_CATEGORY_ORDER,
  RISK_QUESTION_COUNT,
  computeRiskScores,
  isComplete,
  questionsByCategory,
  serializeAnswers,
  type RiskAnswers,
  type RiskQuestion,
  type RiskScores,
} from "@/lib/risk";

type Props = {
  companyId: string;
  /** Remonte les scores calculés pour l'affichage de l'étape 3. */
  onDone: (scores: RiskScores) => void;
};

/** Étape 2 : questionnaire de risque en 9 questions, toutes obligatoires. */
export function RiskStep({ companyId, onDone }: Props) {
  const [answers, setAnswers] = useState<RiskAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const repondues = Object.keys(answers).length;
  const complet = useMemo(() => isComplete(answers), [answers]);

  function choisir(questionId: string, index: number) {
    setAnswers((precedent) => ({ ...precedent, [questionId]: index }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!complet) return;

    setError(null);
    setLoading(true);

    const scores = computeRiskScores(answers);

    const supabase = createClient();
    const { error: insertError } = await supabase.from("risk_assessments").insert({
      company_id: companyId,
      reponses: serializeAnswers(answers),
      score_procedures: scores.procedures,
      score_humain: scores.humain,
      score_technique: scores.technique,
      score_global: scores.global,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Premier point de la courbe (score questionnaire)
    await supabase.from("score_history").insert({
      company_id: companyId,
      score_global: scores.global,
      score_humain: scores.humain,
    });

    onDone(scores);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      {RISK_CATEGORY_ORDER.map((categorie) => (
        <Panel key={categorie}>
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">{RISK_CATEGORY_LABELS[categorie]}</p>
            <p className="mt-2.5 text-[13px] text-muted">
              {RISK_CATEGORY_HINTS[categorie]}
            </p>
          </div>

          <div className="divide-y divide-border">
            {questionsByCategory(categorie).map((question) => (
              <QuestionBlock
                key={question.id}
                question={question}
                choix={answers[question.id]}
                onChoisir={(index) => choisir(question.id, index)}
              />
            ))}
          </div>
        </Panel>
      ))}

      {/* Rappel de progression + validation */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-surface px-5 py-4">
        <p className="text-[13px] text-muted">
          <span className="tabular font-medium text-foreground">
            {repondues} / {RISK_QUESTION_COUNT}
          </span>{" "}
          {repondues === RISK_QUESTION_COUNT
            ? "questions répondues"
            : "questions répondues — répondez à tout pour continuer"}
        </p>

        <button
          type="submit"
          disabled={!complet || loading}
          className={`${buttonPrimary} h-10`}
        >
          {loading ? "Calcul…" : "Voir mon niveau de risque"}
          {!loading && <IconArrowRight />}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function QuestionBlock({
  question,
  choix,
  onChoisir,
}: {
  question: RiskQuestion;
  choix: number | undefined;
  onChoisir: (index: number) => void;
}) {
  return (
    <fieldset className="px-5 py-5">
      <legend className="mb-3 text-[13.5px] font-medium text-foreground">
        {question.question}
      </legend>

      <div className="space-y-2">
        {question.options.map((option, index) => {
          const selectionne = choix === index;

          return (
            <label
              key={option.label}
              className={`flex cursor-pointer items-center gap-3 rounded-[6px] border px-3 py-2.5 text-[13.5px] transition-colors ${
                selectionne
                  ? "border-accent-line bg-accent-soft text-foreground"
                  : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="sr-only"
                checked={selectionne}
                onChange={() => onChoisir(index)}
              />
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selectionne ? "border-accent-text" : "border-border-strong"
                }`}
              >
                {selectionne && (
                  <span className="h-2 w-2 rounded-full bg-accent-text" />
                )}
              </span>
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
