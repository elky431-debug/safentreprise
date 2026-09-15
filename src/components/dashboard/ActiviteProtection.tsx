"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CourbeMenaces, type PointJour } from "@/components/dashboard/CourbeMenaces";
import { useCompteurAnime } from "@/lib/use-compteur-anime";
import { PastilleNiveau } from "@/components/dashboard/Releve";
import type { NiveauRisqueMenace } from "@/lib/types";

/* --------------------------------------------------------------------------
   Périodes
   -------------------------------------------------------------------------- */

export type Periode = "jour" | "7j" | "30j" | "tout";

const PERIODES: { cle: Periode; label: string; titre: string }[] = [
  { cle: "jour", label: "24 h", titre: "Dernières 24 heures" },
  { cle: "7j", label: "7 j", titre: "7 derniers jours" },
  { cle: "30j", label: "30 j", titre: "30 derniers jours" },
  { cle: "tout", label: "Tout", titre: "Depuis le début" },
];

/** Nombre maximal de points tracés — au-delà, la courbe devient illisible. */
const MAX_POINTS = 180;

/** Menace allégée : le graphique n'a besoin que de la date et du niveau. */
export type MenacePourGraphique = {
  id: string;
  detecte_at: string;
  niveau_risque: NiveauRisqueMenace;
};

type ParNiveau = { eleve: number; modere: number; faible: number };

function niveauxVides(): ParNiveau {
  return { eleve: 0, modere: 0, faible: 0 };
}

/* --------------------------------------------------------------------------
   Agrégation
   -------------------------------------------------------------------------- */

function cleJour(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

function cleHeure(d: Date): string {
  return `${cleJour(d)}T${String(d.getHours()).padStart(2, "0")}`;
}

/**
 * Découpe la période en intervalles et compte les alertes de chacun.
 * La fenêtre « 24 h » se lit à l'heure, les autres au jour : sur une journée,
 * un unique point ne dirait rien de la répartition.
 *
 * ⚠ ON COMPTE PAR NIVEAU, PLUS SEULEMENT EN TOTAL. C'est ce que consomme
 *   l'infobulle : sans ventilation, un pic ne dit pas si la journée a été
 *   grave ou seulement bruyante.
 */
function agreger(
  menaces: MenacePourGraphique[],
  periode: Periode,
  maintenant: Date,
): { points: PointJour[]; debut: Date | null } {
  const compteurs = new Map<string, ParNiveau>();

  function ajouter(cle: string, niveau: NiveauRisqueMenace) {
    const actuel = compteurs.get(cle) ?? niveauxVides();
    actuel[niveau] += 1;
    compteurs.set(cle, actuel);
  }

  function point(cle: string, label: string, labelLong: string): PointJour {
    const parNiveau = compteurs.get(cle) ?? niveauxVides();
    return {
      jour: cle,
      label,
      labelLong,
      valeur: parNiveau.eleve + parNiveau.modere + parNiveau.faible,
      parNiveau,
    };
  }

  if (periode === "jour") {
    const debut = new Date(maintenant.getTime() - 23 * 3600_000);
    debut.setMinutes(0, 0, 0);

    for (const m of menaces) {
      const d = new Date(m.detecte_at);
      if (d >= debut) ajouter(cleHeure(d), m.niveau_risque);
    }

    const points: PointJour[] = [];
    for (let i = 0; i < 24; i += 1) {
      const d = new Date(debut.getTime() + i * 3600_000);
      const heure = String(d.getHours()).padStart(2, "0");
      points.push(
        point(
          cleHeure(d),
          `${heure}h`,
          `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}, ${heure}h`,
        ),
      );
    }
    return { points, debut };
  }

  // Fenêtres en jours : on part de minuit pour des journées complètes.
  const aujourdhui = new Date(maintenant);
  aujourdhui.setHours(0, 0, 0, 0);

  let nbJours: number;
  if (periode === "7j") {
    nbJours = 7;
  } else if (periode === "30j") {
    nbJours = 30;
  } else {
    // « Tout » : depuis la plus ancienne alerte, sans dépasser MAX_POINTS.
    const plusAncienne = menaces.reduce<number | null>((min, m) => {
      const t = new Date(m.detecte_at).setHours(0, 0, 0, 0);
      return min === null || t < min ? t : min;
    }, null);
    nbJours =
      plusAncienne === null
        ? 7
        : Math.min(
            MAX_POINTS,
            Math.max(
              7,
              Math.round((aujourdhui.getTime() - plusAncienne) / 86_400_000) + 1,
            ),
          );
  }

  const debut = new Date(aujourdhui);
  debut.setDate(debut.getDate() - (nbJours - 1));

  for (const m of menaces) {
    const d = new Date(m.detecte_at);
    if (d >= debut) ajouter(cleJour(d), m.niveau_risque);
  }

  const points: PointJour[] = [];
  for (let i = 0; i < nbJours; i += 1) {
    const d = new Date(debut);
    d.setDate(debut.getDate() + i);
    points.push(
      point(
        cleJour(d),
        d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        d.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
      ),
    );
  }

  return { points, debut };
}

/* --------------------------------------------------------------------------
   Synthèse
   -------------------------------------------------------------------------- */

type Props = {
  menaces: MenacePourGraphique[];
};

/**
 * Bandeau de synthèse de la protection : un chiffre qui commande, la
 * ventilation par niveau, et la courbe sur la même période.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ TROIS CARTES ONT DISPARU D'ICI, ET ELLES NE DOIVENT PAS REVENIR.
 *
 *   « Mails alertés », « Score de risque », « Répartition » : trois cartes de
 *   même poids, chacune avec son icône en cartouche et son gros chiffre. Le
 *   résultat était que « 40 mails alertés » s'affichait plus gros que
 *   « 29 à risque élevé », alors que c'est le second qui décide d'une action.
 *
 * ⚠ LE CHIFFRE DE TÊTE EST LE NOMBRE D'ALERTES ÉLEVÉES, PAS LE TOTAL. Le total
 *   mesure le bavardage du moteur ; les élevées mesurent ce qui menace
 *   l'entreprise. Quand il n'y en a aucune, la phrase bascule sur le total —
 *   annoncer « 0 » en grand serait juste, mais muet.
 *
 * ⚠ LA CARTE « SCORE DE RISQUE » N'EST PAS DÉPLACÉE, ELLE EST SUPPRIMÉE. Elle
 *   affichait le même 51 % que l'anneau du taux d'exposition, deux blocs plus
 *   bas, mais sans rien en expliquer. On garde celle des deux qui montre son
 *   calcul.
 *
 * ⚠ CHAQUE CHIFFRE EST UN LIEN. Ils menaient tous à une impasse : un dirigeant
 *   qui lit « 29 élevées » veut voir lesquelles. Les compteurs pointent donc
 *   vers `/menaces` filtré sur leur propre niveau.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function ActiviteProtection({ menaces }: Props) {
  const [periode, setPeriode] = useState<Periode>("30j");

  // Date figée au premier rendu : évite que la fenêtre glisse à chaque calcul.
  const [maintenant] = useState(() => new Date());

  const { points, debut } = useMemo(
    () => agreger(menaces, periode, maintenant),
    [menaces, periode, maintenant],
  );

  const surPeriode = useMemo(
    () =>
      debut === null
        ? menaces
        : menaces.filter((m) => new Date(m.detecte_at) >= debut),
    [menaces, debut],
  );

  const repartition = useMemo(
    () => ({
      eleve: surPeriode.filter((m) => m.niveau_risque === "eleve").length,
      modere: surPeriode.filter((m) => m.niveau_risque === "modere").length,
      faible: surPeriode.filter((m) => m.niveau_risque === "faible").length,
    }),
    [surPeriode],
  );

  return (
    <section>
      {/* ⚠ PLUS D'ÉTIQUETTE AU-DESSUS DU GRAPHIQUE. « Activité de la
          protection », en petites capitales espacées, figurait dans la liste
          des suppressions : le graphique se comprend seul, et le titre de
          section au-dessus le nomme déjà. */}
      <div className="flex justify-end pb-3">
        <SelecteurPeriode periode={periode} onChange={setPeriode} />
      </div>

      <div className="bloc-app">
        <div className="grid gap-x-8 gap-y-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <ChiffreDeTete
            eleve={repartition.eleve}
            total={surPeriode.length}
          />

          <VentilationNiveaux
            repartition={repartition}
            total={surPeriode.length}
          />
        </div>

        <div className="border-t border-border px-4 pb-3 pt-4">
          <CourbeMenaces points={points} />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SelecteurPeriode({
  periode,
  onChange,
}: {
  periode: Periode;
  onChange: (p: Periode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Période affichée"
      /* ⚠ LE SEGMENT ACTIF EST EN ENCRE, PLUS EN BLEU. Un contrôle teinté en
         couleur de marque ferait croire que la couleur signifie quelque
         chose ; dans cet écran elle ne signifie qu'un niveau de risque. */
      className="inline-flex items-center gap-0.5 rounded border border-border bg-surface p-0.5"
    >
      {PERIODES.map((p) => {
        const actif = periode === p.cle;
        return (
          <button
            key={p.cle}
            type="button"
            onClick={() => onChange(p.cle)}
            aria-pressed={actif}
            className={`inline-flex h-8 items-center rounded px-3 text-[13.5px] font-medium transition-colors duration-[120ms] ease-out ${
              actif
                ? "bg-foreground text-background"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le chiffre qui commande le bloc.
 *
 * ⚠ IL N'EST PLUS EN SERIF, ET IL NE PORTE PLUS LE NOM DE LA PÉRIODE. La
 *   version précédente l'écrivait en Source Serif coloré et faisait suivre
 *   « sur 30 jours » : le document range la serif et le grand chiffre coloré
 *   dans les suppressions, et le sélecteur juste au-dessus dit déjà la période.
 *   Le prop `titrePeriode` a donc disparu plutôt que d'être gardé inutilisé.
 */
function ChiffreDeTete({
  eleve,
  total,
}: {
  eleve: number;
  total: number;
}) {
  const aucunElevee = eleve === 0;
  const valeur = aucunElevee ? total : eleve;
  const affichee = useCompteurAnime(valeur);

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* ⚠ EN ENCRE, PAS EN ROUGE, ET EN ARCHIVO, PAS EN SERIF. Le grand
            chiffre coloré figurait dans les suppressions. La couleur passe sur
            la pastille à côté, et seulement si le niveau l'exige : un seul
            signal pour une seule information.

            ⚠ ET IL NE DÉPASSE PAS 34 px. Le seul chiffre de 56 px de la page
            est le taux d'exposition, en haut. Deux accroches n'en font plus
            aucune. */}
        <span className="chiffre text-[34px] font-extrabold leading-none tracking-[-0.035em] text-foreground">
          {affichee}
        </span>
        {/* ⚠ LA PASTILLE DIT LE NIVEAU, LA PHRASE NE LE RÉPÈTE PAS. Écrire
            « 9 [Élevé] tentatives à risque élevé » donnait deux fois la même
            information à dix pixels d'écart. La pastille porte le niveau, le
            mot qui suit porte l'unité. */}
        {!aucunElevee && <PastilleNiveau niveau="eleve" />}
        <span className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
          {aucunElevee
            ? total === 1
              ? "tentative détectée"
              : "tentatives détectées"
            : eleve === 1
              ? "tentative"
              : "tentatives"}
        </span>
      </p>

      <p className="texte-second mt-2">
        {/* ⚠ PLUS DE POINT MÉDIAN, ET PLUS DE PÉRIODE ICI. Le point médian fait
            partie du vocabulaire générique que la direction artistique
            supprime ; et la période est déjà lisible dans le sélecteur, juste
            au-dessus. La retirer enlève le séparateur ET une redondance. */}
        {aucunElevee
          ? "Aucune à risque élevé sur la période"
          : `sur ${total} ${total === 1 ? "message signalé" : "messages signalés"}`}
      </p>

      {!aucunElevee && (
        <Link
          href="/menaces?niveau=eleve"
          className="texte-second mt-3 inline-block font-medium text-foreground underline underline-offset-4"
        >
          Voir ces {eleve} {eleve === 1 ? "tentative" : "tentatives"}
        </Link>
      )}
    </div>
  );
}

/** Les trois niveaux, chacun cliquable vers sa propre liste. */
function VentilationNiveaux({
  repartition,
  total,
}: {
  repartition: { eleve: number; modere: number; faible: number };
  total: number;
}) {
  const lignes = [
    { cle: "eleve", label: "Élevé", point: "pastille-eleve", valeur: repartition.eleve },
    { cle: "modere", label: "Modéré", point: "pastille-modere", valeur: repartition.modere },
    { cle: "faible", label: "Faible", point: "pastille-faible", valeur: repartition.faible },
  ] as const;

  return (
    <ul className="lg:border-l lg:border-border lg:pl-8">
      {lignes.map(({ cle, label, point, valeur }) => {
        const part = total > 0 ? Math.round((valeur / total) * 100) : 0;
        return (
          <li key={cle} className="ligne-tableau">
            {/* ⚠ PASTILLE PLEINE, PAS UN POINT SUIVI D'UN LIBELLÉ. Un point
                coloré à côté d'un mot donne deux signaux pour une seule
                information — c'est la règle du document. */}
            <Link
              href={`/menaces?niveau=${cle}`}
              className="flex min-h-[44px] items-center gap-3 py-2"
            >
              <span className={`pastille ${point} ${valeur === 0 ? "opacity-40" : ""}`}>
                {label}
              </span>
              <span className="ml-auto flex items-baseline gap-3">
                <span
                  className={`chiffre ${valeur === 0 ? "text-muted" : "text-foreground"}`}
                >
                  {valeur}
                </span>
                <span className="chiffre w-10 text-right text-[13px] font-normal text-muted">
                  {valeur === 0 ? "" : `${part} %`}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
