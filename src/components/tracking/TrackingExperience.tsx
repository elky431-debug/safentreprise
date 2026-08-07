"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  scoreSurCent,
  signauxAlerte,
  titreScenario,
  type QuestionQuiz,
} from "@/lib/quiz";
import type { TypeFraude } from "@/lib/types";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { Logo } from "@/components/Logo";

export type CiblePublique = {
  target_id: string;
  token_unique: string;
  prenom: string;
  type_fraude: TypeFraude;
  a_clique: boolean;
  a_signale: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
};

type Props = {
  token: string;
  cible: CiblePublique;
  questions: QuestionQuiz[];
};

/**
 * Page pédagogique + quiz après clic sur le lien de simulation.
 * Les questions viennent de quiz_questions (via RPC).
 */
export function TrackingExperience({ token, cible, questions }: Props) {
  const typeFraude: TypeFraude =
    cible.type_fraude === "fournisseur" ? "fournisseur" : "president";

  const [signale, setSignale] = useState(cible.a_signale);
  const [reponses, setReponses] = useState<(number | null)[]>(
    () => questions.map(() => null),
  );
  const [soumis, setSoumis] = useState(cible.quiz_complete);
  const [score, setScore] = useState(cible.score_quiz);
  const [envoiQuiz, setEnvoiQuiz] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const signaux = useMemo(() => signauxAlerte(typeFraude), [typeFraude]);

  async function signaler() {
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("marquer_signalement", {
      p_token: token,
    });
    if (error) {
      setErreur("Le signalement n'a pas pu être enregistré.");
      return;
    }
    setSignale(true);
  }

  async function terminerQuiz() {
    setErreur(null);
    if (questions.length === 0) {
      setErreur("Aucune question de quiz configurée.");
      return;
    }
    if (reponses.some((r) => r === null)) {
      setErreur("Répondez à toutes les questions avant de valider.");
      return;
    }

    const bonnes = questions.reduce((acc, q, i) => {
      return acc + (reponses[i] === q.correctIndex ? 1 : 0);
    }, 0);
    const scoreCalcule = scoreSurCent(bonnes, questions.length);

    setEnvoiQuiz(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("enregistrer_quiz", {
      p_token: token,
      p_score: scoreCalcule,
    });
    setEnvoiQuiz(false);

    if (error) {
      setErreur("Le score n'a pas pu être enregistré. Réessayez.");
      return;
    }

    // Historise le score dynamique entreprise (fire-and-forget)
    void fetch("/api/risk/snapshot-from-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {
      /* non bloquant pour l'employé */
    });

    setScore(scoreCalcule);
    setSoumis(true);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Logo />
          <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent-text">
            Simulation
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        {/* Bandeau rassurant */}
        <div className="rounded-xl border border-accent-line/40 bg-accent-soft px-4 py-4 sm:px-5">
          <p className="text-[14px] font-semibold text-accent-text">
            Ceci était une simulation de sécurité
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/90">
            Aucun risque, aucune donnée bancaire collectée, aucun virement
            possible. Bonjour {cible.prenom} — merci d&apos;avoir ouvert ce
            message d&apos;entraînement.
          </p>
        </div>

        <section className="mt-8">
          <p className="eyebrow">Formation</p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-foreground">
            {titreScenario(typeFraude)}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Les fraudeurs imitent une urgence crédible. Voici les signaux à
            reconnaître avant d&apos;agir.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-border bg-surface px-5 py-5">
          <h2 className="text-[15px] font-semibold text-foreground">
            Signaux d&apos;alerte
          </h2>
          <ul className="mt-3 space-y-2.5">
            {signaux.map((s) => (
              <li
                key={s}
                className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" />
                {s}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-border bg-surface px-5 py-5">
          <h2 className="text-[15px] font-semibold text-foreground">
            Cas réels
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            En 2019, le cabinet d&apos;ingénierie{" "}
            <strong className="font-medium text-foreground">Arup</strong> a
            perdu l&apos;équivalent d&apos;environ{" "}
            <strong className="font-medium text-foreground">25 millions
            de dollars</strong>{" "}
            après une série de virements déclenchés par des emails frauduleux
            imitant la direction.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            En France et en Europe, le préjudice moyen d&apos;une arnaque au
            président tourne autour de{" "}
            <strong className="font-medium text-foreground">75&nbsp;000&nbsp;€</strong>
            — parfois bien davantage quand la procédure de contrôle est
            contournée.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={signale}
            onClick={() => void signaler()}
            className={buttonSecondary}
          >
            {signale
              ? "Signalement enregistré"
              : "J'aurais signalé ce message"}
          </button>
        </div>

        {/* Quiz */}
        <section className="mt-10">
          <p className="eyebrow">Quiz</p>
          <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">
            {questions.length} question
            {questions.length > 1 ? "s" : ""} pour ancrer les bons réflexes
          </h2>

          {questions.length === 0 && !soumis ? (
            <p className="mt-6 text-[13.5px] text-muted">
              Aucune question de quiz n&apos;est configurée pour le moment.
            </p>
          ) : soumis && score !== null ? (
            <div className="mt-6 rounded-xl border border-success/30 bg-success-soft px-5 py-6 text-center">
              <p className="text-[15px] font-semibold text-success">
                Bravo {cible.prenom} — quiz terminé
              </p>
              <p className="tabular mt-2 text-[36px] font-semibold tracking-[-0.04em] text-foreground">
                {score}
                <span className="text-[16px] font-medium text-muted"> / 100</span>
              </p>
              <p className="mt-2 text-[13.5px] text-muted">
                Votre score est enregistré pour le suivi de la campagne. Merci
                de votre vigilance.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {questions.map((q, qi) => (
                <fieldset
                  key={q.id}
                  className="rounded-xl border border-border bg-surface px-4 py-4 sm:px-5"
                >
                  <legend className="px-1 text-[14px] font-medium text-foreground">
                    {qi + 1}. {q.question}
                  </legend>
                  <ul className="mt-3 space-y-2">
                    {q.choices.map((choix, ci) => {
                      const id = `${q.id}-${ci}`;
                      return (
                        <li key={id}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2/50 has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft">
                            <input
                              type="radio"
                              name={q.id}
                              checked={reponses[qi] === ci}
                              onChange={() =>
                                setReponses((prev) => {
                                  const next = [...prev];
                                  next[qi] = ci;
                                  return next;
                                })
                              }
                              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                            />
                            <span className="text-[13.5px] leading-relaxed text-muted">
                              {choix}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}

              {erreur && (
                <p className="text-[13px] text-danger" role="alert">
                  {erreur}
                </p>
              )}

              <button
                type="button"
                disabled={envoiQuiz}
                onClick={() => void terminerQuiz()}
                className={buttonPrimary}
              >
                {envoiQuiz ? "Enregistrement…" : "Valider mon quiz"}
              </button>
            </div>
          )}
        </section>

        <p className="mt-12 text-center text-[12px] text-faint">
          Safentreprise — sensibilisation interne consentie
        </p>
      </main>
    </div>
  );
}
