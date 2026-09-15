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
import { IconPlus, IconUsers } from "@/components/icons";
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
 * Le tableau de bord — l'affichage seul.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ IL NE LIT NI SESSION NI BASE, ET C'EST CE QUI PERMET DE LE MONTRER. La
 *   page `/dashboard` charge les données et ne fait que lui passer des props.
 *   Séparés ainsi, le même composant peut être rendu avec un jeu fabriqué pour
 *   une relecture visuelle, sans identifiants Supabase et sans recopier son
 *   balisage dans une maquette qui divergerait au premier changement.
 *
 * ⚠ CET ÉCRAN SUIT `docs/DIRECTION-ARTISTIQUE.md` À LA LETTRE. Six marques ont
 *   été retirées le 15 septembre, et elles ne doivent pas revenir :
 *
 *     1. le fil d'ariane en petites capitales espacées ;
 *     2. l'étiquette au-dessus du graphique — il se comprend seul ;
 *     3. le mot « Safentreprise » répété alors que le logo est dans la barre ;
 *     4. la flèche accolée aux liens ;
 *     5. le grand chiffre en serif coloré ;
 *     6. le remplissage dégradé sous la courbe.
 *
 * ⚠ UN SEUL CHIFFRE DÉPASSE 34 px SUR CETTE PAGE : le taux d'exposition, en
 *   haut. C'est le seul endroit où l'interface s'affirme, et c'est le CONTRASTE
 *   avec le reste qui produit l'effet. Grossir un second chiffre le détruirait.
 *
 * ⚠ LE TABLEAU PASSE AVANT LE GRAPHIQUE. C'est là que le dirigeant travaille ;
 *   la courbe est un contexte, pas le sujet. L'ordre précédent — courbe, puis
 *   tableau — en faisait un élément secondaire.
 * ─────────────────────────────────────────────────────────────────────────
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
    <div className="mx-auto w-full max-w-[1280px]">
      <EnteteApp nomSociete={nomSociete} />

      {/* Écart entre sections : 32 px, valeur unique du document. */}
      <div className="mt-8 space-y-8">
        <Exposition
          scores={scores}
          boitesSurveillees={boitesSurveillees}
          employes={employes}
        />

        <section>
          <TitreSection titre="Tentatives récentes" />
          <ListeMenaces menaces={menaces.slice(0, LIGNES_AFFICHEES)} />
          {menaces.length > 0 && <PiedListeMenaces total={menaces.length} />}
        </section>

        <section>
          <TitreSection titre="Tentatives dans le temps" />
          <ActiviteProtection menaces={menacesGraphique} />
        </section>

        <section>
          <TitreSection
            titre="Campagnes"
            lien={{ href: "/campaigns", libelle: "Toutes les campagnes" }}
          />
          <ListeCampagnes campagnes={campagnes} />
        </section>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   En-tête
   -------------------------------------------------------------------------- */

/**
 * ⚠ LE NOM DE L'ENTREPRISE CLIENTE, PAS LE NÔTRE. Le logo Safentreprise est
 *   déjà dans la barre latérale ; le répéter ici occupait la ligne la plus
 *   visible de la page pour ne rien apprendre. Et le fil d'ariane en petites
 *   capitales espacées qui le précédait était le marqueur générique le plus
 *   voyant de l'écran.
 */
function EnteteApp({ nomSociete }: { nomSociete: string }) {
  const maintenant = new Date();
  const debut = new Date(maintenant);
  debut.setDate(debut.getDate() - 29);

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="titre-page-da text-foreground">{nomSociete}</h1>
        <p className="texte-second mt-1.5">
          Du {formaterJourMois(debut)} au {formaterJourMois(maintenant)}
        </p>
      </div>

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
    </header>
  );
}

/**
 * ⚠ PAS DE FILET SOUS LE TITRE. « Les bordures encodent une information, elles
 *   ne décorent pas » : deux blocs de même nature se séparent par l'espace.
 *   Un filet horizontal sous chaque titre était l'une des marques listées.
 */
function TitreSection({
  titre,
  lien,
}: {
  titre: string;
  lien?: { href: string; libelle: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-3">
      <h2 className="titre-section text-foreground">{titre}</h2>
      {lien && (
        <Link
          href={lien.href}
          className="texte-second font-medium text-foreground hover:underline"
        >
          {lien.libelle}
        </Link>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Le taux d'exposition — le seul endroit où l'on s'affirme
   -------------------------------------------------------------------------- */

type Scores = ReturnType<typeof appliquerSurveillanceAuScore>;

/**
 * ⚠ 56 px, ARCHIVO 800, SERRAGE −0.04em, ET RIEN D'AUTRE NE DÉPASSE 34 px.
 *   C'est la seule affirmation de la page, et elle ne vaut que par le silence
 *   de tout ce qui l'entoure.
 *
 * ⚠ L'ANNEAU A DISPARU. Il dessinait un cercle décoratif autour d'un nombre
 *   qui se lit très bien seul, et la direction artistique ne demande qu'un
 *   nombre avec une légende courte. La couleur du niveau reste, mais sur la
 *   pastille — un seul signal pour une seule information.
 *
 * ⚠ LES LIBELLÉS SONT EN FRANÇAIS, PAS EN ABRÉVIATIONS. « Humain DYN. » et
 *   « Technique −10 » étaient indéchiffrables pour un dirigeant de PME, qui est
 *   pourtant le lecteur.
 */
function Exposition({
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
      <section className="bloc-app p-5">
        <p className="texte-courant text-muted">
          Complétez le questionnaire de risque pour afficher votre taux
          d&apos;exposition.
        </p>
      </section>
    );
  }

  const niveau = riskLevel(scores.global);

  const titres: Record<RiskCategory, string> = {
    procedures: "Vos procédures internes",
    humain: "La vigilance de vos équipes",
    technique: "Vos protections techniques",
  };

  const explications: Record<RiskCategory, string> = {
    procedures:
      "D'après vos réponses sur la validation des virements et la vérification des RIB.",
    humain:
      "Recalculé d'après les résultats de vos campagnes, et non d'après le questionnaire.",
    technique:
      scores.reductionTechnique > 0
        ? `Allégé de ${scores.reductionTechnique} points parce que ${boitesSurveillees} ${
            boitesSurveillees === 1 ? "boîte est surveillée" : "boîtes sont surveillées"
          } sur ${employes} ${employes === 1 ? "collaborateur" : "collaborateurs"}.`
        : "D'après vos garde-fous d'outils et d'accès.",
  };

  return (
    <section className="bloc-app grid gap-x-12 gap-y-6 p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <p className="flex items-baseline gap-3">
          <span className="chiffre-accroche text-foreground">
            {scores.global}
            <span className="text-[28px]">&nbsp;%</span>
          </span>
          <PastilleNiveau niveau={niveau} />
        </p>
        <p className="texte-second mt-2">
          Taux d&apos;exposition à la fraude au virement
        </p>
      </div>

      <ul>
        {RISK_CATEGORY_ORDER.map((categorie) => (
          <li
            key={categorie}
            className="ligne-tableau flex items-start justify-between gap-5 py-3 first:pt-0"
          >
            <div className="min-w-0">
              <p className="titre-bloc text-foreground">{titres[categorie]}</p>
              <p className="texte-second mt-0.5">{explications[categorie]}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="chiffre block text-foreground">
                {scores[categorie]}&nbsp;%
              </span>
              {categorie === "technique" && scores.reductionTechnique > 0 && (
                <span className="chiffre mt-1 block text-[13px] font-normal text-muted line-through">
                  {scores.techniqueBase}&nbsp;%
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La pastille de niveau : pleine, texte blanc, rayon 3 px.
 *
 * ⚠ PAS DE POINT COLORÉ À L'INTÉRIEUR D'UN CADRE CLAIR. C'était deux signaux
 *   pour une seule information — la couleur du fond suffit.
 */
export function PastilleNiveau({
  niveau,
}: {
  niveau: "faible" | "modere" | "eleve";
}) {
  const classe = {
    eleve: "pastille pastille-eleve",
    modere: "pastille pastille-modere",
    faible: "pastille pastille-faible",
  }[niveau];

  return (
    <span className={classe}>
      {RISK_LEVEL_LABELS[niveau].replace(/^Risque\s+/i, "")}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Campagnes
   -------------------------------------------------------------------------- */

function ListeCampagnes({ campagnes }: { campagnes: CampagneListe[] }) {
  if (campagnes.length === 0) {
    return (
      <div className="bloc-app p-5">
        <p className="texte-courant text-foreground">
          Aucune campagne pour l&apos;instant.
        </p>
        <Link href="/campaigns/new" className={`${buttonPrimary} mt-4`}>
          <IconPlus />
          Créer une campagne
        </Link>
      </div>
    );
  }

  return (
    <div className="bloc-app overflow-hidden">
      <ul>
        {campagnes.slice(0, 5).map((campagne) => {
          const envoyes =
            campagne.campaign_targets?.filter((t) => t.message_final_html)
              .length ?? 0;
          return (
            <li key={campagne.id} className="ligne-tableau">
              <Link
                href={`/campaigns/${campagne.id}`}
                className="flex min-h-[44px] items-center justify-between gap-4 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-foreground">
                    {campagne.nom}
                  </p>
                  <p className="texte-second mt-0.5">
                    {formaterDateLongue(new Date(campagne.created_at))},{" "}
                    {envoyes === 1 ? "1 message" : `${envoyes} messages`}
                  </p>
                </div>
                <span className="texte-second shrink-0">
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
