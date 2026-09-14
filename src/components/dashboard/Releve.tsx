import Link from "next/link";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import {
  ActiviteProtection,
  type MenacePourGraphique,
} from "@/components/dashboard/ActiviteProtection";
import {
  ListeMenaces,
  PiedListeMenaces,
} from "@/components/dashboard/ListeMenaces";
import { IconArrowRight, IconPlus, IconUsers } from "@/components/icons";
import {
  RISK_CATEGORY_ORDER,
  RISK_LEVEL_LABELS,
  riskLevel,
  type RiskCategory,
} from "@/lib/risk";
import type { appliquerSurveillanceAuScore } from "@/lib/risk-surveillance";
import type { AlerteGraph } from "@/lib/types";
import { STATUT_LABELS } from "@/lib/campaigns";

/** Tentatives listées sur cet écran ; le reste est sur `/menaces`. */
const LIGNES_AFFICHEES = 5;

export type CampagneListe = {
  id: string;
  nom: string;
  statut: keyof typeof STATUT_LABELS;
  created_at: string;
  campaign_targets: { id: string; message_final_html: string | null }[] | null;
};

export type ReleveProps = {
  nomSociete: string;
  menaces: AlerteGraph[];
  menacesGraphique: MenacePourGraphique[];
  scores: Scores | null;
  boitesSurveillees: number;
  employes: number;
  campagnes: CampagneListe[];
};

/**
 * Le tableau de bord, présenté comme un relevé — l'affichage seul.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠ IL NE LIT NI SESSION NI BASE, ET C'EST CE QUI PERMET DE LE MONTRER. La
 *   page `/dashboard` charge les données et ne fait que lui passer des props.
 *   Séparés ainsi, le même composant peut être rendu avec un jeu fabriqué pour
 *   une relecture visuelle, sans identifiants Supabase et sans recopier son
 *   balisage dans une maquette qui divergerait au premier changement.
 *
 * ⚠ L'ORDRE DES SECTIONS PORTE LA HIÉRARCHIE. Les tentatives viennent AVANT le
 *   taux d'exposition et les campagnes : c'est la seule section sur laquelle un
 *   dirigeant agit le jour même. La synthèse qui la précède tient volontairement
 *   en peu de hauteur pour ne pas la repousser sous le pli.
 *
 * ⚠ LA COULEUR NE DÉSIGNE QU'UN NIVEAU DE RISQUE. Rouge, ambre, gris : rien
 *   d'autre n'est coloré sur cet écran — ni les compteurs, ni la courbe, ni les
 *   contrôles. C'est ce qui fait qu'une tache rouge se remarque.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function Releve({
  nomSociete,
  menaces,
  menacesGraphique,
  scores,
  boitesSurveillees,
  employes,
  campagnes,
}: ReleveProps) {
  return (
    <>
      <EnteteReleve nomSociete={nomSociete} />

      <div className="mt-8 space-y-9">
        <ActiviteProtection menaces={menacesGraphique} />

        <section>
          <TitreSection
            titre="Tentatives récentes"
            description="Chaque ligne ouvre le détail de la tentative."
          />
          <ListeMenaces menaces={menaces.slice(0, LIGNES_AFFICHEES)} />
          {menaces.length > 0 && <PiedListeMenaces total={menaces.length} />}
        </section>

        <section>
          <TitreSection
            titre="Taux d'exposition"
            description="Ce que votre organisation offre à une tentative de fraude, avant même qu'elle arrive."
          />
          <TauxExposition
            scores={scores}
            boitesSurveillees={boitesSurveillees}
            employes={employes}
          />
        </section>

        <section>
          <TitreSection
            titre="Campagnes"
            description="Simulations en cours et prêtes à partir."
            lien={{ href: "/campaigns", libelle: "Toutes les campagnes" }}
          />
          <ListeCampagnes campagnes={campagnes} />
        </section>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   En-tête de relevé
   -------------------------------------------------------------------------- */

/**
 * L'en-tête du document.
 *
 * ⚠ C'EST LUI QUI DONNE LE TON, AVANT MÊME QU'ON LISE UN CHIFFRE. Petites
 *   capitales espacées, nom de la société en serif, période et date d'édition
 *   sous un filet plein : les codes d'un relevé de banque ou d'une liasse
 *   comptable. L'ancien en-tête — « Tableau de bord » suivi d'un sous-titre
 *   gris — ne disait ni pour qui ni pour quand.
 *
 * ⚠ LA DATE EST CALCULÉE AU RENDU, SUR LE SERVEUR. Cette page est déjà
 *   dynamique — elle lit la session — donc aucune mise en cache n'ira figer un
 *   « édité le » périmé.
 */
function EnteteReleve({ nomSociete }: { nomSociete: string }) {
  const maintenant = new Date();
  const debut = new Date(maintenant);
  debut.setDate(debut.getDate() - 29);

  return (
    <header>
      <p className="eyebrow">Safentreprise · Surveillance de la messagerie</p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h1 className="serif-vitrine text-[27px] leading-tight text-foreground">
          {nomSociete}
        </h1>

        <div className="flex flex-wrap gap-2">
          <Link href="/employees" className={buttonSecondary}>
            <IconUsers />
            Collaborateurs
          </Link>
          <Link href="/campaigns/new" className={buttonPrimary}>
            <IconPlus />
            Nouvelle campagne
          </Link>
        </div>
      </div>

      <div className="filet-releve mt-3" />

      <p className="mt-2.5 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[12px] text-faint">
        <span>
          Période du {formaterJourMois(debut)} au {formaterJourMois(maintenant)}
        </span>
        <span>Édité le {formaterDateLongue(maintenant)}</span>
      </p>
    </header>
  );
}

/* --------------------------------------------------------------------------
   Sections
   -------------------------------------------------------------------------- */

function TitreSection({
  titre,
  description,
  lien,
}: {
  titre: string;
  description?: string;
  lien?: { href: string; libelle: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 pb-3">
      <div className="min-w-0">
        <h2 className="serif-vitrine text-[17px] leading-tight text-foreground">
          {titre}
        </h2>
        {description && (
          <p className="mt-1 text-[12.5px] text-muted">{description}</p>
        )}
      </div>
      {lien && (
        <Link
          href={lien.href}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-text underline underline-offset-4 hover:text-foreground"
        >
          {lien.libelle}
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Taux d'exposition
   -------------------------------------------------------------------------- */

export type Scores = ReturnType<typeof appliquerSurveillanceAuScore>;

/**
 * ⚠ C'EST LA SEULE OCCURRENCE DU SCORE SUR CET ÉCRAN. Une carte « Score de
 *   risque » affichait le même pourcentage plus haut, dans un cadre à moitié
 *   vide et sans rien en expliquer. Des deux, on garde celle qui montre son
 *   calcul : l'anneau, les trois axes, et ce que la surveillance retire.
 *
 * ⚠ LES LIBELLÉS SONT ÉCRITS EN FRANÇAIS, PAS EN ABRÉVIATIONS. « Humain DYN. »
 *   et « Technique −10 » étaient indéchiffrables pour un dirigeant de PME —
 *   c'est pourtant lui le lecteur. Chaque axe dit maintenant d'où vient son
 *   chiffre, en une phrase.
 */
function TauxExposition({
  scores,
  boitesSurveillees,
  employes,
}: {
  scores: Scores | null;
  boitesSurveillees: number;
  employes: number;
}) {
  if (!scores) {
    return (
      <div className="bloc-releve px-6 py-10">
        <p className="text-[13px] text-muted">
          Aucune évaluation disponible — complétez le questionnaire de risque
          pour afficher le taux d&apos;exposition.
        </p>
      </div>
    );
  }

  const niveau = riskLevel(scores.global);

  const explications: Record<RiskCategory, string> = {
    procedures:
      "D'après vos réponses sur la validation des virements et la vérification des RIB.",
    humain: `Recalculé d'après les résultats de vos campagnes, et non d'après le questionnaire.`,
    technique:
      scores.reductionTechnique > 0
        ? `Allégé de ${scores.reductionTechnique} points parce que ${boitesSurveillees} ${
            boitesSurveillees === 1 ? "boîte est surveillée" : "boîtes sont surveillées"
          } sur ${employes} ${employes === 1 ? "collaborateur" : "collaborateurs"}.`
        : "D'après vos garde-fous d'outils et d'accès. Aucune boîte surveillée ne l'allège pour l'instant.",
  };

  const titres: Record<RiskCategory, string> = {
    procedures: "Vos procédures internes",
    humain: "La vigilance de vos équipes",
    technique: "Vos protections techniques",
  };

  return (
    <div className="bloc-releve">
      <div className="flex flex-col items-center gap-7 px-6 py-6 lg:flex-row lg:items-start">
        <AnneauExposition pourcentage={scores.global} niveau={niveau} />

        <ul className="w-full min-w-0">
          {RISK_CATEGORY_ORDER.map((categorie) => (
            <li
              key={categorie}
              className="ligne-releve flex items-start justify-between gap-5 py-3 first:pt-0"
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">
                  {titres[categorie]}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">
                  {explications[categorie]}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <span className="tabular block text-[15px] font-semibold text-foreground">
                  {scores[categorie]}&nbsp;%
                </span>
                {categorie === "technique" && scores.reductionTechnique > 0 && (
                  <span className="tabular block text-[11.5px] text-faint line-through">
                    {scores.techniqueBase}&nbsp;%
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {scores.reductionTechnique > 0 && (
        <div className="filet-section px-6 py-3.5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Sans la surveillance de vos boîtes, votre taux d&apos;exposition
            serait de{" "}
            <span className="tabular font-medium text-foreground">
              {scores.globalSansSurveillance}&nbsp;%
            </span>{" "}
            — soit{" "}
            <span className="tabular font-medium text-foreground">
              {scores.globalSansSurveillance - scores.global} points
            </span>{" "}
            de plus.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * L'anneau du taux d'exposition.
 *
 * ⚠ L'ARC PREND LA COULEUR DU NIVEAU, PLUS CELLE DE LA MARQUE. Il était bleu,
 *   c'est-à-dire décoratif : un taux de 12 % et un taux de 84 % se peignaient
 *   pareil. Rouge, ambre ou gris, il dit maintenant quelque chose — et il
 *   reste dans la seule règle de couleur de l'écran.
 */
function AnneauExposition({
  pourcentage,
  niveau,
}: {
  pourcentage: number;
  niveau: "faible" | "modere" | "eleve";
}) {
  const rayon = 46;
  const circonference = 2 * Math.PI * rayon;
  const borne = Math.min(Math.max(pourcentage, 0), 100) / 100;
  const offset = circonference * (1 - borne);

  const teinte = {
    eleve: "var(--danger)",
    modere: "var(--warning)",
    faible: "var(--muted)",
  }[niveau];

  return (
    <div className="relative h-[128px] w-[128px] shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-surface-3"
        />
        <circle
          cx="64"
          cy="64"
          r={rayon}
          fill="none"
          stroke={teinte}
          strokeWidth="6"
          strokeDasharray={circonference}
          strokeDashoffset={offset}
          className="results-ring-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="serif-vitrine tabular text-[30px] leading-none text-foreground">
          {pourcentage}
          <span className="text-[15px]">&nbsp;%</span>
        </p>
        <p className="eyebrow mt-2">
          {RISK_LEVEL_LABELS[niveau].replace(/^Risque\s+/i, "")}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Campagnes
   -------------------------------------------------------------------------- */

function ListeCampagnes({ campagnes }: { campagnes: CampagneListe[] }) {
  if (campagnes.length === 0) {
    return (
      <div className="bloc-releve px-6 py-10 text-center">
        <p className="text-[13.5px] font-medium text-foreground">
          Aucune campagne
        </p>
        <Link href="/campaigns/new" className={`${buttonPrimary} mt-4`}>
          <IconPlus />
          Créer une campagne
        </Link>
      </div>
    );
  }

  return (
    <div className="bloc-releve overflow-hidden">
      <ul>
        {campagnes.slice(0, 5).map((campagne) => {
          const envoyes =
            campagne.campaign_targets?.filter((t) => t.message_final_html)
              .length ?? 0;
          return (
            <li key={campagne.id} className="ligne-releve">
              <Link
                href={`/campaigns/${campagne.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-foreground">
                    {campagne.nom}
                  </p>
                  <p className="tabular mt-0.5 text-[12px] text-faint">
                    {formaterDateLongue(new Date(campagne.created_at))} ·{" "}
                    {envoyes === 1 ? "1 message" : `${envoyes} messages`}
                  </p>
                </div>
                <span className="eyebrow shrink-0">
                  {STATUT_LABELS[campagne.statut]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Dates
   -------------------------------------------------------------------------- */

function formaterJourMois(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function formaterDateLongue(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
