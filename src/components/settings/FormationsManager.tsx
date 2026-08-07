"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TypeFraude } from "@/lib/types";
import {
  Alert,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "@/components/ui";
import { TYPE_FRAUDE_LABELS } from "@/lib/campaigns";

export type QuizQuestionRow = {
  id: string;
  type_fraude: TypeFraude | null;
  question: string;
  options: string[];
  bonne_reponse: number;
  ordre: number;
  actif: boolean;
};

type Props = { initial: QuizQuestionRow[] };

/** CRUD des questions du quiz post-simulation. */
export function FormationsManager({ initial }: Props) {
  const [questions, setQuestions] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formulaire nouvelle / édition
  const [editId, setEditId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [bonne, setBonne] = useState(0);
  const [ordre, setOrdre] = useState(1);
  const [typeFraude, setTypeFraude] = useState<"" | TypeFraude>("");
  const [actif, setActif] = useState(true);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setEditId(null);
    setQuestion("");
    setOptionsText("");
    setBonne(0);
    setOrdre(questions.length + 1);
    setTypeFraude("");
    setActif(true);
  }

  function ouvrir(q: QuizQuestionRow) {
    setEditId(q.id);
    setQuestion(q.question);
    setOptionsText(q.options.join("\n"));
    setBonne(q.bonne_reponse);
    setOrdre(q.ordre);
    setTypeFraude(q.type_fraude ?? "");
    setActif(q.actif);
  }

  async function sauvegarder(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const options = optionsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (options.length < 2) {
      setError("Indiquez au moins 2 options (une par ligne).");
      return;
    }
    if (bonne < 0 || bonne >= options.length) {
      setError("L'index de la bonne réponse est invalide (0-based).");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      question: question.trim(),
      options,
      bonne_reponse: bonne,
      ordre,
      type_fraude: typeFraude || null,
      actif,
    };

    if (editId) {
      const { data, error: err } = await supabase
        .from("quiz_questions")
        .update(payload)
        .eq("id", editId)
        .select("*")
        .single();
      setSaving(false);
      if (err || !data) {
        setError(err?.message ?? "Échec de la mise à jour.");
        return;
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editId
            ? {
                ...q,
                ...payload,
                options,
                type_fraude: payload.type_fraude as TypeFraude | null,
              }
            : q,
        ),
      );
    } else {
      const { data, error: err } = await supabase
        .from("quiz_questions")
        .insert(payload)
        .select("*")
        .single();
      setSaving(false);
      if (err || !data) {
        setError(err?.message ?? "Échec de la création.");
        return;
      }
      setQuestions((prev) => [
        ...prev,
        {
          id: data.id,
          question: data.question,
          options: data.options as string[],
          bonne_reponse: data.bonne_reponse,
          ordre: data.ordre,
          type_fraude: data.type_fraude,
          actif: data.actif,
        },
      ]);
    }

    setSuccess("Question enregistrée.");
    resetForm();
  }

  async function supprimer(id: string) {
    if (!window.confirm("Supprimer cette question ?")) return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from("quiz_questions")
      .delete()
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Formations"
        description="Questions du quiz affiché après un clic sur un lien de simulation."
      />

      {(error || success) && (
        <div className="mb-6 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>
      )}

      <Panel className="mb-6 overflow-hidden">
        <PanelHeader title="Questions" />
        <ul className="divide-y divide-border">
          {questions
            .slice()
            .sort((a, b) => a.ordre - b.ordre)
            .map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-start justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-foreground">
                    {q.ordre}. {q.question}
                  </p>
                  <p className="mt-1 text-[12px] text-faint">
                    {q.type_fraude
                      ? TYPE_FRAUDE_LABELS[q.type_fraude]
                      : "Tous scénarios"}{" "}
                    · {q.actif ? "Actif" : "Inactif"} · bonne = option #
                    {q.bonne_reponse}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => ouvrir(q)}
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => void supprimer(q.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title={editId ? "Modifier la question" : "Nouvelle question"}
        />
        <form onSubmit={sauvegarder} className="space-y-4 px-6 py-5">
          <Field
            label="Énoncé"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
              Options (une par ligne)
            </span>
            <textarea
              required
              rows={5}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              className={`${inputClass} h-auto resize-y py-2.5`}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Index bonne réponse (0 = 1re)"
              type="number"
              min={0}
              required
              value={bonne}
              onChange={(e) => setBonne(Number(e.target.value))}
            />
            <Field
              label="Ordre"
              type="number"
              min={1}
              required
              value={ordre}
              onChange={(e) => setOrdre(Number(e.target.value))}
            />
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                Type de fraude
              </span>
              <select
                className={inputClass}
                value={typeFraude}
                onChange={(e) =>
                  setTypeFraude(e.target.value as "" | TypeFraude)
                }
              >
                <option value="">Tous</option>
                <option value="president">Président</option>
                <option value="fournisseur">Fournisseur</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={actif}
              onChange={(e) => setActif(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            {editId && (
              <button
                type="button"
                className={buttonSecondary}
                onClick={resetForm}
              >
                Annuler
              </button>
            )}
            <button type="submit" disabled={saving} className={buttonPrimary}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
