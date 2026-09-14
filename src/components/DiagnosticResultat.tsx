"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LIBELLE_PALIER,
  SYNTHESES,
  calculerScore,
  detailler,
  horsPerimetre,
  offrePourEffectif,
  palierDuScore,
  trouverOption,
  type Palier,
  type Reponses,
} from "@/lib/diagnostic";
import { OFFRES, formaterEuros } from "@/lib/tarifs";
import { useCompteurAnime } from "@/lib/use-compteur-anime";
import {
  buttonGhost,
  buttonPrimaryLg,
  buttonSecondaryLg,
  inputClass,
} from "@/components/ui";
import { IconArrowRight, IconAlertTriangle, IconCheck } from "@/components/icons";

/**
 * La page de résultat.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ LE SCORE S'AFFICHE SANS ATTENDRE LE SERVEUR. `calculerScore` tourne dans
 *   le navigateur ; l'enregistrement part en parallèle et son échec ne se voit
 *   nulle part. Le répondant a donné huit réponses : lui montrer une erreur
 *   d'écriture à la place de son résultat serait le punir d'une panne qui ne
 *   le regarde pas.
 *
 * ⚠ L'ANNEAU EST EN MARINE, PAS EN ROUGE, QUEL QUE SOIT LE SCORE. Le rouge de
 *   la charte est réservé aux alertes réelles du produit. Un anneau rouge sur
 *   une page commerciale, c'est du théâtre — et ça décrédibilise le rouge des
 *   vraies alertes. Le palier est porté par une pastille de texte, qui suit
 *   elle la convention de la charte (élevé rouge, significatif ambre, modéré
 *   gris).
 *
 * ⚠ L'EMAIL EST FACULTATIF ET LE RESTE. Le score est déjà affiché quand le
 *   champ apparaît : rien n'est retenu en otage. Un formulaire qui masque le
 *   résultat tant qu'on n'a pas donné son adresse est un piège, et il se paie
 *   en confiance sur un produit qui vend la confiance.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Géométrie de l'anneau. */
const RAYON = 88;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

const TONS_PALIER: Record<Palier, string> = {
  eleve: "border-danger/25 bg-danger-soft text-danger",
  significatif: "border-warning/25 bg-warning-soft text-warning",
  modere: "border-border bg-surface-2 text-muted",
};

export function DiagnosticResultat({
  reponses,
  onRecommencer,
}: {
  reponses: Reponses;
  onRecommencer: () => void;
}) {
  const score = calculerScore(reponses);
  const palier = palierDuScore(score);
  const lignes = detailler(reponses);
  const offre = offrePourEffectif(reponses.effectif, OFFRES);
  const horsCouverture = horsPerimetre(reponses);
  const messagerie = trouverOption("messagerie", reponses.messagerie);

  const affiche = useCompteurAnime(score, 1100);

  /* ⚠ L'ARC PART DE ZÉRO À LA PREMIÈRE IMAGE, PUIS SEULEMENT ON POSE LA CIBLE.
     Sans ce passage en deux temps, la transition CSS n'a pas d'état de départ
     et l'anneau apparaît déjà rempli. */
  const [arc, setArc] = useState(0);
  useEffect(() => {
    const image = requestAnimationFrame(() => setArc(score));
    return () => cancelAnimationFrame(image);
  }, [score]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-12 sm:py-16">
      <Anneau score={score} affiche={affiche} arc={arc} palier={palier} />

      <p className="rise rise-1 mx-auto mt-8 max-w-[58ch] text-center text-[16px] leading-relaxed text-muted">
        {SYNTHESES[palier]}
      </p>

      {horsCouverture && messagerie && (
        <HorsPerimetre messagerie={messagerie.libelle} />
      )}

      {/* ---- Le détail --------------------------------------------------- */}
      <section className="mt-14">
        <h2 className="titre-page text-[21px] text-foreground">
          Ce qui pèse dans votre score
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Vos cinq réponses, de la plus lourde à la plus légère.
        </p>

        <ol className="mt-7 flex flex-col gap-3">
          {lignes.map((ligne) => (
            <li
              key={ligne.cle}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-[15px] font-semibold text-foreground">
                  {ligne.constat}
                </h3>
                <span
                  className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] tabular-nums text-faint"
                  aria-label={`${ligne.poids} points sur votre score`}
                >
                  +{ligne.poids}
                </span>
              </div>

              <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
                {ligne.implication}
              </p>

              <p className="mt-3 flex items-start gap-2 text-[14px] leading-relaxed text-foreground">
                <IconCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-text" />
                <span>{ligne.reponse}</span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      {offre && <CarteOffre offre={offre} />}

      <RecevoirParEmail reponses={reponses} score={score} />

      <div className="mt-10 text-center">
        <button type="button" onClick={onRecommencer} className={buttonGhost}>
          Refaire le diagnostic
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   L'anneau
   ========================================================================== */

function Anneau({
  score,
  affiche,
  arc,
  palier,
}: {
  score: number;
  affiche: number;
  arc: number;
  palier: Palier;
}) {
  return (
    <div className="rise flex flex-col items-center">
      <div className="relative h-[200px] w-[200px]">
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full -rotate-90"
          aria-hidden
        >
          <circle
            cx="100"
            cy="100"
            r={RAYON}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="10"
          />
          <circle
            className="results-ring-arc"
            cx="100"
            cy="100"
            r={RAYON}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCONFERENCE}
            strokeDashoffset={CIRCONFERENCE * (1 - arc / 100)}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* ⚠ LE CHIFFRE ANIMÉ EST MASQUÉ AUX LECTEURS D'ÉCRAN : ils
              annonceraient chaque valeur intermédiaire. Le score final est
              donné une fois, en texte, juste à côté. */}
          <span
            aria-hidden
            className="text-[52px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground"
          >
            {affiche}
          </span>
          <span className="sr-only">
            Score d’exposition : {score} sur 100. {LIBELLE_PALIER[palier]}.
          </span>
          <span aria-hidden className="mt-1.5 text-[12.5px] text-faint">
            sur 100
          </span>
        </div>
      </div>

      <p
        aria-hidden
        className={`mt-5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${TONS_PALIER[palier]}`}
      >
        {LIBELLE_PALIER[palier]}
      </p>
    </div>
  );
}

/* ==========================================================================
   Hors périmètre
   ========================================================================== */

/**
 * ⚠ CE BLOC DIT NON, ET IL LE DIT AVANT L'OFFRE. Encaisser une demande de démo
 *   d'une entreprise qu'on ne peut pas brancher coûte deux rendez-vous et une
 *   réputation. Le dire ici, c'est perdre un prospect tout de suite plutôt que
 *   mal — et c'est cohérent avec le reste du produit, qui n'annonce jamais une
 *   mesure qu'il n'applique pas.
 */
function HorsPerimetre({ messagerie }: { messagerie: string }) {
  return (
    <section className="mt-10 rounded-2xl border border-warning/25 bg-warning-soft p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-warning">
        <IconAlertTriangle className="h-4 w-4 shrink-0" />
        Nous ne couvrons pas encore {messagerie}
      </h2>
      <p className="mt-2.5 text-[14px] leading-relaxed text-foreground">
        Votre score reste valable&nbsp;: il mesure votre exposition, pas votre
        outillage. Mais la surveillance de Safentreprise se branche aujourd’hui
        sur Microsoft&nbsp;365 uniquement, et nous préférons vous le dire
        maintenant plutôt qu’en fin de rendez-vous.
      </p>
      <p className="mt-2.5 text-[14px] leading-relaxed text-foreground">
        Laissez votre adresse plus bas&nbsp;: nous vous prévenons quand votre
        messagerie est couverte, et pour rien d’autre.
      </p>
    </section>
  );
}

/* ==========================================================================
   L'offre
   ========================================================================== */

function CarteOffre({
  offre,
}: {
  offre: NonNullable<ReturnType<typeof offrePourEffectif>>;
}) {
  return (
    <section className="mt-14 rounded-2xl border border-border-strong bg-surface-2 p-6 sm:p-7">
      <p className="eyebrow">Votre offre</p>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="titre-page text-[24px] text-foreground">{offre.nom}</h2>
        <p className="text-[13px] text-muted">{offre.effectif}</p>
      </div>

      {offre.prix ? (
        <p className="mt-5 text-[16px] leading-relaxed text-foreground">
          <strong className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
            {formaterEuros(offre.prix.miseEnService)}
          </strong>{" "}
          de mise en service, puis{" "}
          <strong className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
            {formaterEuros(offre.prix.mensuel)}
          </strong>{" "}
          par mois.
          <span className="mt-1.5 block text-[13px] text-faint">
            Montants hors taxes. Engagement 12 mois.
          </span>
        </p>
      ) : (
        <p className="mt-5 text-[16px] leading-relaxed text-foreground">
          Au-delà de 200 collaborateurs, la grille ne s’applique plus telle
          quelle&nbsp;: le nombre de boîtes à surveiller et les circuits de
          validation changent trop d’une organisation à l’autre.{" "}
          <strong className="font-semibold">Nous consulter.</strong>
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/demo" className={buttonPrimaryLg}>
          Demander une démo
          <IconArrowRight />
        </Link>
        <Link href="/tarifs" className={buttonSecondaryLg}>
          Voir le détail des prestations
        </Link>
      </div>
    </section>
  );
}

/* ==========================================================================
   Recevoir le résultat par email
   ========================================================================== */

type EtatEnvoi = "repos" | "envoi" | "ok" | "erreur";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function RecevoirParEmail({
  reponses,
  score,
}: {
  reponses: Reponses;
  score: number;
}) {
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<EtatEnvoi>("repos");

  /* ⚠ L'ENREGISTREMENT PART UNE SEULE FOIS, SANS EMAIL, DÈS L'AFFICHAGE. C'est
     lui qui fait remonter ce que répondent les prospects, et il ne doit pas
     dépendre du fait qu'on laisse une adresse. `envoye` empêche le double
     envoi que provoquerait un remontage (mode strict de React en
     développement). */
  const envoye = useRef(false);
  const identifiant = useRef<string | null>(null);

  useEffect(() => {
    if (envoye.current) return;
    envoye.current = true;

    fetch("/api/diagnostic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reponses, score }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id?: string } | null) => {
        if (data?.id) identifiant.current = data.id;
      })
      // Un échec d'enregistrement ne doit rien changer à ce que voit le
      // répondant : il n'y a donc rien à faire ici.
      .catch(() => {});
  }, [reponses, score]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const adresse = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(adresse)) {
      setEtat("erreur");
      return;
    }

    setEtat("envoi");
    try {
      const reponse = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reponses,
          score,
          email: adresse,
          id: identifiant.current,
        }),
      });
      setEtat(reponse.ok ? "ok" : "erreur");
    } catch {
      setEtat("erreur");
    }
  }

  if (etat === "ok") {
    return (
      <section className="mt-10 rounded-2xl border border-success/25 bg-success-soft p-5">
        <p className="flex items-start gap-2 text-[14.5px] leading-relaxed text-success">
          <IconCheck className="mt-1 h-3.5 w-3.5 shrink-0" />
          <span>
            C’est noté. Nous vous envoyons ce résultat, et rien d’autre&nbsp;:
            votre adresse ne part sur aucune liste.
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-foreground">
        Recevoir ce résultat par email
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Facultatif. Votre score est déjà affiché, il ne dépend pas de cette
        case.
      </p>

      <form onSubmit={soumettre} className="mt-4 flex flex-wrap gap-2.5">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (etat === "erreur") setEtat("repos");
          }}
          placeholder="vous@entreprise.fr"
          autoComplete="email"
          aria-label="Votre adresse email"
          aria-invalid={etat === "erreur"}
          className={`${inputClass} h-11 min-w-[200px] flex-1 text-[14px]`}
        />
        <button
          type="submit"
          disabled={etat === "envoi"}
          className={buttonPrimaryLg}
        >
          {etat === "envoi" ? "Envoi…" : "Recevoir"}
        </button>
      </form>

      {etat === "erreur" && (
        <p role="alert" className="mt-2.5 text-[13px] text-danger">
          Cette adresse ne semble pas valide, ou l’envoi n’a pas abouti.
          Réessayez.
        </p>
      )}
    </section>
  );
}
