"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUESTIONS,
  type CleQuestion,
  type Reponses,
} from "@/lib/diagnostic";
import { DiagnosticResultat } from "@/components/DiagnosticResultat";
import { buttonGhost, buttonPrimaryLg, inputClass } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

/**
 * Le parcours : une question à la fois, plein écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ UN CLIC SUFFIT, ET IL FAIT AVANCER. Un questionnaire où il faut choisir
 *   PUIS cliquer sur « suivant » double le nombre de gestes pour rien : le
 *   choix EST la validation. Le délai de 160 ms n'est pas un effet de style —
 *   sans lui, la réponse disparaît avant d'avoir été vue, et on ne sait plus
 *   ce qu'on vient de cocher.
 *
 * ⚠ LE RETOUR EN ARRIÈRE NE PERD RIEN. Les réponses restent dans l'état :
 *   revenir sur une question la montre cochée. Une correction ne doit pas
 *   coûter le parcours entier.
 *
 * ⚠ LE SCORE EST CALCULÉ DANS LE NAVIGATEUR, PAS DEMANDÉ AU SERVEUR. Le
 *   résultat s'affiche donc même si l'enregistrement échoue — et il échoue
 *   forcément un jour. Faire dépendre l'affichage de l'écriture, c'est perdre
 *   le prospect ET sa réponse.
 *
 * ⚠ LA PROGRESSION COMPTE LES QUESTIONS RÉPONDUES, PAS L'INDEX. Sur la
 *   dernière question, la barre doit montrer qu'il reste quelque chose à
 *   faire ; elle ne se remplit qu'au résultat.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Laisse voir la réponse cochée avant de passer à la suite. */
const DELAI_AVANCE_MS = 160;

export function DiagnosticParcours() {
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Reponses>({});
  const [termine, setTermine] = useState(false);
  const [domaine, setDomaine] = useState("");

  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  const question = QUESTIONS[index];
  const derniere = index === QUESTIONS.length - 1;

  const avancer = useCallback(() => {
    if (derniere) setTermine(true);
    else setIndex((i) => i + 1);
  }, [derniere]);

  const repondre = useCallback(
    (cle: CleQuestion, valeur: string) => {
      setReponses((r) => ({ ...r, [cle]: valeur }));
      if (minuterie.current) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(avancer, DELAI_AVANCE_MS);
    },
    [avancer],
  );

  /* ⚠ LES CHIFFRES DU CLAVIER SONT UN RACCOURCI, PAS LA SEULE ENTRÉE. Tout
     reste accessible au clic et à la tabulation — ce sont de vrais boutons. */
  useEffect(() => {
    if (termine || !question.options) return;

    const surTouche = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const rang = Number(e.key);
      const option = question.options?.[rang - 1];
      if (option) {
        e.preventDefault();
        repondre(question.cle, option.valeur);
      }
    };

    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [question, repondre, termine]);

  if (termine) {
    return (
      <DiagnosticResultat
        reponses={reponses}
        onRecommencer={() => {
          setReponses({});
          setDomaine("");
          setIndex(0);
          setTermine(false);
        }}
      />
    );
  }

  const repondues = QUESTIONS.filter((q) => reponses[q.cle] !== undefined).length;
  const progression = Math.round((repondues / QUESTIONS.length) * 100);

  return (
    <div className="mx-auto w-full max-w-[680px] px-6 py-12 sm:py-16">
      {/* ---- Progression ------------------------------------------------- */}
      <div className="flex items-center gap-4">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuenow={progression}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du diagnostic"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progression}%` }}
          />
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-faint">
          {index + 1} / {QUESTIONS.length}
        </span>
      </div>

      {/* ⚠ `key` SUR L'INDEX : le remontage rejoue `rise`, qui est déjà neutralisé
          par `prefers-reduced-motion` dans globals.css. Pas de seconde
          mécanique d'animation à entretenir. */}
      <div key={index} className="rise mt-10 sm:mt-14">
        <h1 className="titre-page text-[clamp(1.35rem,3.2vw,1.9rem)] leading-[1.2] text-balance text-foreground">
          {question.intitule}
        </h1>

        {question.precision && (
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            {question.precision}
          </p>
        )}

        {question.options && (
          <ul className="mt-8 flex flex-col gap-2.5">
            {question.options.map((option, rang) => {
              const choisie = reponses[question.cle] === option.valeur;
              return (
                <li key={option.valeur}>
                  <button
                    type="button"
                    onClick={() => repondre(question.cle, option.valeur)}
                    aria-pressed={choisie}
                    className={`flex w-full items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-colors duration-150 ${
                      choisie
                        ? "border-accent-line bg-accent-soft"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-medium tabular-nums ${
                        choisie
                          ? "bg-accent text-accent-contraste"
                          : "bg-surface-3 text-faint"
                      }`}
                    >
                      {rang + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-foreground">
                        {option.libelle}
                      </span>
                      {option.precision && (
                        <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                          {option.precision}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {question.saisieLibre && (
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              const valeur = domaine.trim();
              if (valeur) setReponses((r) => ({ ...r, domaine: valeur }));
              setTermine(true);
            }}
          >
            <input
              type="text"
              value={domaine}
              onChange={(e) => setDomaine(e.target.value)}
              placeholder={question.saisieLibre.placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-label={question.intitule}
              className={`${inputClass} h-11 text-[15px]`}
            />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" className={buttonPrimaryLg}>
                Voir mon résultat
                <IconArrowRight />
              </button>
              <button
                type="button"
                onClick={() => setTermine(true)}
                className={buttonGhost}
              >
                Passer
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className={`${buttonGhost} disabled:invisible`}
        >
          ← Question précédente
        </button>
        {question.options && (
          <span className="hidden text-[12px] text-faint sm:block">
            Astuce&nbsp;: les touches 1 à {question.options.length} répondent.
          </span>
        )}
      </div>
    </div>
  );
}
