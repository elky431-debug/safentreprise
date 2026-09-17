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
 * ⚠ CE QUI EST DONNÉ, ET CE QUI EST DEMANDÉ.
 *
 *   Le score, le palier, la phrase de synthèse et l'accès à la démonstration
 *   sont rendus sans rien demander : le visiteur a répondu à huit questions, il
 *   repart avec une réponse même s'il ne laisse rien.
 *
 *   L'analyse détaillée — ce que chaque réponse implique, ce qu'on fait dessus,
 *   et le prix — demande quatre champs. C'est un arbitrage assumé, et il tient
 *   parce que la partie utile au visiteur seul (son niveau d'exposition) reste
 *   gratuite. Une version antérieure de ce fichier soutenait qu'aucun résultat
 *   ne devait être retenu ; la règle est maintenue sur le SCORE, levée sur le
 *   détail.
 *
 * ⚠ LE BLOC VERROUILLÉ EST `inert`, PAS SEULEMENT FLOUTÉ. Un flou CSS ne cache
 *   rien : le texte reste sélectionnable, lisible par un lecteur d'écran, et
 *   accessible à la tabulation. `inert` retire l'ensemble du parcours clavier
 *   et de l'arbre d'accessibilité d'un coup — sinon la page promettrait une
 *   chose à l'œil et en livrerait une autre au clavier.
 *
 * ⚠ L'ANNEAU EST EN MARINE, PAS EN ROUGE, QUEL QUE SOIT LE SCORE. Le rouge de
 *   la charte est réservé aux alertes réelles du produit. Un anneau rouge sur
 *   une page commerciale, c'est du théâtre — et ça décrédibilise le rouge des
 *   vraies alertes. Le palier est porté par une pastille de texte, qui suit
 *   elle la convention de la charte.
 *
 * ⚠ LE SCORE S'AFFICHE SANS ATTENDRE LE SERVEUR. `calculerScore` tourne dans
 *   le navigateur ; l'enregistrement part en parallèle et son échec ne se voit
 *   nulle part. Le répondant a donné huit réponses : lui montrer une erreur
 *   d'écriture à la place de son résultat serait le punir d'une panne qui ne
 *   le regarde pas.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Géométrie de l'anneau. */
const RAYON = 88;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * ⚠ `--eleve` ET PAS `--danger`, ARRÊTÉ LE 17 SEPTEMBRE 2026. Un score
 *   d'exposition est une DONNÉE de risque, exactement comme un niveau de
 *   menace dans le tableau de bord — pas une panne du produit. C'est aussi ce
 *   qui aligne l'écran sur le mail : `diagnostic-email.ts` porte `#9D3F49`
 *   depuis la passe précédente, et un prospect voyait son résultat d'une
 *   couleur à l'écran et d'une autre dans sa boîte.
 *
 * ⚠ ET C'EST POUR ÇA QU'ON NE DÉCOLORE PAS. L'option « neutre partout » a été
 *   écartée délibérément : le diagnostic est l'outil de conviction du produit,
 *   et un dirigeant qui découvre son exposition doit VOIR que le résultat est
 *   mauvais. Retirer la couleur ici, c'est retirer le signal au seul endroit
 *   où il travaille.
 *
 * ⚠ L'AMBRE, LUI, RESTE DÉSALIGNÉ, ET C'EST UNE LIMITE CONNUE. Dans le mail,
 *   le palier « significatif » garde `#8F5F00` : `--modere` y serait du TEXTE
 *   sur fond ambre pâle, à 4,11:1, sous le seuil AA de 4,5:1. Ici il est sur
 *   fond clair et passe. Une teinte choisie pour un fond ne se transporte pas
 *   telle quelle sur un autre — même leçon que le voyant de la bande de
 *   motifs. Voir le document, section « La vitrine suit la direction ».
 */
const TONS_PALIER: Record<Palier, { classes: string; bord: string }> = {
  eleve: { classes: "bg-eleve-soft text-eleve", bord: "var(--eleve)" },
  significatif: {
    classes: "bg-warning-soft text-warning",
    bord: "var(--warning)",
  },
  modere: { classes: "bg-surface-2 text-muted", bord: "var(--border)" },
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

  /* `null` = verrouillé. Une fois dévoilé, la valeur dit si l'analyse est
     VRAIMENT partie par email — la page l'a promis, elle doit pouvoir se
     corriger si Resend n'a pas suivi. */
  const [envoiAnalyse, setEnvoiAnalyse] = useState<null | {
    ok: boolean;
    email: string;
  }>(null);

  /* ⚠ L'ARC PART DE ZÉRO À LA PREMIÈRE IMAGE, PUIS SEULEMENT ON POSE LA CIBLE.
     Sans ce passage en deux temps, la transition CSS n'a pas d'état de départ
     et l'anneau apparaît déjà rempli. */
  const [arc, setArc] = useState(0);
  useEffect(() => {
    const image = requestAnimationFrame(() => setArc(score));
    return () => cancelAnimationFrame(image);
  }, [score]);

  /* L'identifiant de la ligne écrite au premier appel. Le formulaire le
     renvoie pour compléter CETTE ligne plutôt que d'en créer une seconde. */
  const identifiant = useRef<string | null>(null);
  const envoye = useRef(false);

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

  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-12 sm:py-16">
      <Anneau score={score} affiche={affiche} arc={arc} palier={palier} />

      <p className="rise rise-1 mx-auto mt-8 max-w-[58ch] text-center text-[16px] leading-relaxed text-muted">
        {SYNTHESES[palier]}
      </p>

      {/* ⚠ L'ACTION PRINCIPALE EST AU-DESSUS DU VERROU. Quelqu'un de convaincu
          par son seul score doit pouvoir demander une démonstration sans
          passer par le formulaire : l'obliger à donner ses coordonnées deux
          fois pour la même intention, c'est perdre celui qui était déjà prêt. */}
      <div className="rise rise-2 mt-9 flex justify-center">
        <Link href="/demo" className={buttonPrimaryLg}>
          Demander une démo
          <IconArrowRight />
        </Link>
      </div>

      {horsCouverture && messagerie && (
        <HorsPerimetre messagerie={messagerie.libelle} />
      )}

      <ZoneVerrouillee
        envoiAnalyse={envoiAnalyse}
        lignes={lignes}
        offre={offre}
        formulaire={
          <Formulaire
            reponses={reponses}
            score={score}
            identifiant={identifiant}
            onDevoile={setEnvoiAnalyse}
          />
        }
      />

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

      {/* ⚠ LE LISERÉ EST EN LIGNE, ET IL DOIT LE RESTER. `border-eleve/25`
          était écrit ici et ne s'appliquait PAS : la règle balai
          `* { border-color: var(--border) }` de globals.css n'est dans aucune
          couche, donc elle bat tous les utilitaires de bordure. La pastille
          portait un liseré gris depuis toujours, sans que personne le voie —
          constaté le 17 septembre 2026 en relisant la couleur calculée, pas le
          code. Le même piège est documenté dans `SecteursOnglets`. */}
      <p
        aria-hidden
        style={{ borderColor: TONS_PALIER[palier].bord }}
        className={`mt-5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${TONS_PALIER[palier].classes}`}
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
    </section>
  );
}

/* ==========================================================================
   La zone verrouillée
   ========================================================================== */

/**
 * Le détail et l'offre, sous un voile tant que le formulaire n'est pas rempli.
 *
 * ⚠ ON MONTRE LE VRAI CONTENU, FLOUTÉ ET TRONQUÉ — PAS UN LEURRE. Un bloc gris
 *   générique ne dit pas ce qu'on gagne à remplir ; le vrai texte, dont on
 *   devine la structure, le dit. Et il n'y a rien à cacher : ce sont les
 *   réponses du visiteur.
 *
 * ⚠ LA HAUTEUR EST BORNÉE, PAS SEULEMENT LE FLOU. Sans `max-height`, la page
 *   ferait quatre écrans de contenu illisible avant d'arriver au formulaire —
 *   la moitié des visiteurs ne le verraient jamais.
 */
function ZoneVerrouillee({
  envoiAnalyse,
  lignes,
  offre,
  formulaire,
}: {
  envoiAnalyse: null | { ok: boolean; email: string };
  lignes: ReturnType<typeof detailler>;
  offre: ReturnType<typeof offrePourEffectif>;
  formulaire: React.ReactNode;
}) {
  const devoile = envoiAnalyse !== null;

  return (
    <>
      {envoiAnalyse && <AccuseEnvoi envoi={envoiAnalyse} />}

      <section className="mt-14">
        <h2 className="titre-page text-[21px] text-foreground">
          Ce qui pèse dans votre score
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {devoile
            ? "Vos cinq réponses, de la plus lourde à la plus légère."
            : "Vos cinq réponses, ce que chacune implique, et ce que nous faisons dessus."}
        </p>

        <div className={devoile ? "" : "relative"}>
          <div
            /* `inert` retire tout le bloc du clavier et des lecteurs d'écran.
               Sans lui, le flou ne serait qu'un effet visuel. */
            inert={!devoile}
            className={
              devoile
                ? ""
                : "max-h-[300px] overflow-hidden blur-[5px] select-none [mask-image:linear-gradient(to_bottom,#000_40%,transparent_100%)]"
            }
          >
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

            {offre && <CarteOffre offre={offre} />}
          </div>
        </div>
      </section>

      {!devoile && formulaire}
    </>
  );
}

/* ==========================================================================
   L'accusé d'envoi
   ========================================================================== */

/**
 * ⚠ ON NE DIT « ENVOYÉ » QUE SI ÇA L'EST. Le formulaire a promis une copie par
 *   email ; annoncer l'envoi sans le vérifier laisserait quelqu'un attendre un
 *   message qui n'arrivera jamais, et fermer la page en pensant l'avoir. La
 *   route rend le sort réel de l'envoi, et les deux cas ont leur phrase.
 */
function AccuseEnvoi({ envoi }: { envoi: { ok: boolean; email: string } }) {
  if (envoi.ok) {
    return (
      <p
        role="status"
        className="mt-10 flex items-start gap-2 rounded-2xl border border-success/25 bg-success-soft p-4 text-[14px] leading-relaxed text-success"
      >
        <IconCheck className="mt-1 h-3.5 w-3.5 shrink-0" />
        <span>
          Votre analyse est ci-dessous, et une copie part vers{" "}
          <strong className="font-semibold">{envoi.email}</strong>.
        </span>
      </p>
    );
  }

  return (
    <p
      role="status"
      className="mt-10 rounded-2xl border border-border bg-surface-2 p-4 text-[14px] leading-relaxed text-muted"
    >
      Votre analyse est ci-dessous. L’envoi par email n’a pas abouti&nbsp;:
      inutile de l’attendre, tout est sur cette page.
    </p>
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
            {formaterEuros(offre.prix.abonnementMensuel)}
          </strong>{" "}
          par mois, après un audit initial de{" "}
          <strong className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
            {formaterEuros(offre.prix.auditInitial)}
          </strong>{" "}
          facturé une fois au démarrage.
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
   Le formulaire
   ========================================================================== */

type EtatEnvoi = "repos" | "envoi" | "erreur";

const CHAMPS = [
  { cle: "prenom", label: "Prénom", type: "text", autoComplete: "given-name" },
  { cle: "nom", label: "Nom", type: "text", autoComplete: "family-name" },
  {
    cle: "email",
    label: "Email professionnel",
    type: "email",
    autoComplete: "email",
  },
  {
    cle: "entreprise",
    label: "Entreprise",
    type: "text",
    autoComplete: "organization",
  },
] as const;

type CleChamp = (typeof CHAMPS)[number]["cle"];

/**
 * ⚠ PAS DE TÉLÉPHONE. C'est le champ qui fait le plus abandonner un
 *   formulaire, et il n'apporte rien qu'un échange par email ne permette
 *   d'obtenir ensuite. L'ajouter coûterait plus de prospects qu'il n'en
 *   qualifierait.
 *
 * ⚠ PAS DE CASE À COCHER, PRÉ-COCHÉE OU NON. Le traitement repose sur
 *   l'exécution de la demande du visiteur — il demande son analyse, on la lui
 *   envoie. Une case de consentement suggérerait un traitement supplémentaire
 *   qui n'existe pas ; une case pré-cochée serait en plus sans valeur.
 *
 * ⚠ AUCUN PIXEL, AUCUN TRACEUR. La seule requête émise est celle de
 *   l'enregistrement.
 */
function Formulaire({
  reponses,
  score,
  identifiant,
  onDevoile,
}: {
  reponses: Reponses;
  score: number;
  identifiant: React.RefObject<string | null>;
  onDevoile: (envoi: { ok: boolean; email: string }) => void;
}) {
  const [valeurs, setValeurs] = useState<Record<CleChamp, string>>({
    prenom: "",
    nom: "",
    email: "",
    entreprise: "",
  });
  const [etat, setEtat] = useState<EtatEnvoi>("repos");
  const [message, setMessage] = useState("");

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    setMessage("");

    try {
      const reponse = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reponses,
          score,
          id: identifiant.current,
          ...valeurs,
        }),
      });

      /* ⚠ UNE ERREUR 400 SE CORRIGE, LE RESTE NE SE CORRIGE PAS PAR LE
         VISITEUR. Un email mal formé doit être signalé ; une panne de base ou
         de Resend ne doit pas retenir en otage une analyse qu'il vient de
         payer de ses coordonnées. Dans ce cas on dévoile quand même : il a
         rempli sa part, la nôtre ne le regarde pas. */
      if (reponse.status === 400) {
        const corps = (await reponse.json().catch(() => null)) as
          | { erreur?: string }
          | null;
        setEtat("erreur");
        setMessage(corps?.erreur ?? "Vérifiez les champs et réessayez.");
        return;
      }

      const corps = (await reponse.json().catch(() => null)) as
        | { analyseEnvoyee?: boolean }
        | null;

      onDevoile({ ok: corps?.analyseEnvoyee === true, email: valeurs.email });
    } catch {
      // Réseau coupé : on dévoile aussi. Les coordonnées sont perdues, pas
      // l'analyse — et c'est le bon sens de l'arbitrage.
      onDevoile({ ok: false, email: valeurs.email });
    }
  }

  return (
    <section
      id="analyse-detaillee"
      className="mt-8 rounded-2xl border border-border-strong bg-surface p-6 sm:p-7"
    >
      <h2 className="titre-page text-[21px] text-foreground">
        Recevez votre analyse détaillée
      </h2>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted">
        Le détail de vos cinq réponses, ce que chacune implique concrètement, et
        l’offre correspondant à votre effectif. Affichée ici, et envoyée par
        email.
      </p>

      <form onSubmit={soumettre} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {CHAMPS.map((champ) => (
            <label key={champ.cle} className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                {champ.label}
              </span>
              <input
                type={champ.type}
                required
                value={valeurs[champ.cle]}
                onChange={(e) => {
                  setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }));
                  if (etat === "erreur") setEtat("repos");
                }}
                autoComplete={champ.autoComplete}
                className={`${inputClass} h-11 text-[14.5px]`}
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={etat === "envoi"}
            className={buttonPrimaryLg}
          >
            {etat === "envoi" ? "Un instant…" : "Voir mon analyse"}
            {etat === "envoi" ? null : <IconArrowRight />}
          </button>
        </div>

        {etat === "erreur" && message && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {message}
          </p>
        )}

        <p className="mt-5 max-w-[64ch] text-[12.5px] leading-relaxed text-faint">
          Ces informations sont traitées par Safentreprise pour répondre à votre
          demande et vous envoyer cette analyse. Elles ne sont ni cédées ni
          revendues, et sont effacées au bout de douze mois.{" "}
          <Link
            href="/politique-de-confidentialite"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Politique de confidentialité
          </Link>
          .
        </p>
      </form>
    </section>
  );
}
