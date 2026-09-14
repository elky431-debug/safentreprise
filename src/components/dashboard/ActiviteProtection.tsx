"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CourbeMenaces, type PointJour } from "@/components/dashboard/CourbeMenaces";
import { useCompteurAnime } from "@/lib/use-compteur-anime";
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

  const titrePeriode =
    PERIODES.find((p) => p.cle === periode)?.titre ?? "Période";

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h2 className="eyebrow">Activité de la protection</h2>
        <SelecteurPeriode periode={periode} onChange={setPeriode} />
      </div>

      <div className="bloc-releve">
        <div className="grid gap-x-8 gap-y-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <ChiffreDeTete
            eleve={repartition.eleve}
            total={surPeriode.length}
            titrePeriode={titrePeriode}
          />

          <VentilationNiveaux
            repartition={repartition}
            total={surPeriode.length}
          />
        </div>

        <div className="filet-section px-4 pb-3 pt-4">
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
      className="inline-flex items-center gap-0.5 border border-border bg-surface p-0.5"
      style={{ borderRadius: 4 }}
    >
      {PERIODES.map((p) => {
        const actif = periode === p.cle;
        return (
          <button
            key={p.cle}
            type="button"
            onClick={() => onChange(p.cle)}
            aria-pressed={actif}
            style={{ borderRadius: 2 }}
            className={`inline-flex h-7 items-center px-2.5 text-[12.5px] font-medium transition-colors duration-150 ${
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
 * Le chiffre qui commande la page.
 *
 * ⚠ IL EST EN SERIF, ET CE N'EST PAS UN ORNEMENT. Le serif de la vitrine est
 *   ce qui rattache l'écran au reste de la marque et lui donne son air de
 *   relevé ; un chiffre en grotesque très serré est exactement la signature
 *   d'un tableau de bord de croissance.
 */
function ChiffreDeTete({
  eleve,
  total,
  titrePeriode,
}: {
  eleve: number;
  total: number;
  titrePeriode: string;
}) {
  const aucunElevee = eleve === 0;
  const valeur = aucunElevee ? total : eleve;
  const affichee = useCompteurAnime(valeur);

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`serif-vitrine tabular text-[52px] leading-none ${
            aucunElevee ? "text-foreground" : "text-danger"
          }`}
        >
          {affichee}
        </span>
        <span className="serif-vitrine text-[19px] leading-tight text-foreground">
          {aucunElevee
            ? total === 1
              ? "tentative détectée"
              : "tentatives détectées"
            : eleve === 1
              ? "tentative à risque élevé"
              : "tentatives à risque élevé"}
        </span>
      </p>

      <p className="mt-2.5 text-[13px] text-muted">
        {aucunElevee ? (
          <>
            Aucune à risque élevé sur la période
            <span className="text-faint"> · {titrePeriode.toLowerCase()}</span>
          </>
        ) : (
          <>
            sur {total} {total === 1 ? "message signalé" : "messages signalés"}
            <span className="text-faint"> · {titrePeriode.toLowerCase()}</span>
          </>
        )}
      </p>

      {!aucunElevee && (
        <Link
          href="/menaces?niveau=eleve"
          className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text underline underline-offset-4 hover:text-foreground"
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
    { cle: "eleve", label: "Élevé", point: "bg-danger", valeur: repartition.eleve },
    { cle: "modere", label: "Modéré", point: "bg-warning", valeur: repartition.modere },
    { cle: "faible", label: "Faible", point: "bg-muted", valeur: repartition.faible },
  ] as const;

  return (
    <ul className="lg:border-l lg:border-border lg:pl-8">
      {lignes.map(({ cle, label, point, valeur }) => {
        const part = total > 0 ? Math.round((valeur / total) * 100) : 0;
        return (
          <li key={cle} className="ligne-releve">
            <Link
              href={`/menaces?niveau=${cle}`}
              className="flex items-center gap-2.5 py-2.5 transition-colors hover:text-accent-text"
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${point} ${
                  valeur === 0 ? "opacity-25" : ""
                }`}
              />
              <span className="text-[13px] text-muted">{label}</span>
              <span className="ml-auto flex items-baseline gap-2">
                <span
                  className={`tabular text-[14px] font-semibold ${
                    valeur === 0 ? "text-faint" : "text-foreground"
                  }`}
                >
                  {valeur}
                </span>
                <span className="tabular w-9 text-right text-[11px] text-faint">
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
