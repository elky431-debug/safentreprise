import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MenacesTable } from "@/components/menaces/MenacesTable";
import { PageHeader, Panel, buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import type { Company, MenaceDetectee } from "@/lib/types";

/** Nombre de menaces chargées (les plus récentes). */
const LIMITE = 500;

/** Premier jour du mois courant, en ISO — borne du compteur mensuel. */
function debutDuMoisIso(): string {
  const maintenant = new Date();
  return new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    1,
  ).toISOString();
}

/** Tableau de bord des tentatives détectées par l'extension. */
export default async function MenacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle<Company>();

  if (!company) {
    return null;
  }

  // La RLS restreint déjà à la société du dirigeant ; le filtre explicite
  // garde la requête lisible et l'index (company_id, detecte_at) utilisable.
  const { data: rows } = await supabase
    .from("menaces_detectees")
    .select("*")
    .eq("company_id", company.id)
    .order("detecte_at", { ascending: false })
    .limit(LIMITE)
    .returns<MenaceDetectee[]>();

  const menaces = (rows ?? []).map((m) => ({
    ...m,
    // signaux est du JSONB : on garantit un tableau côté client
    signaux: Array.isArray(m.signaux) ? m.signaux : [],
  }));

  const debutMois = debutDuMoisIso();
  const duMois = menaces.filter((m) => m.detecte_at >= debutMois);

  const compteurs = {
    total: duMois.length,
    eleve: duMois.filter((m) => m.niveau_risque === "eleve").length,
    modere: duMois.filter((m) => m.niveau_risque === "modere").length,
    faible: duMois.filter((m) => m.niveau_risque === "faible").length,
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Menaces"
        description="Les tentatives d'usurpation interceptées sur les boîtes mail de vos collaborateurs. Seules les métadonnées sont conservées."
      />

      {menaces.length === 0 ? (
        <EtatVide />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Compteur
              label="Ce mois-ci"
              valeur={compteurs.total}
              detail={
                compteurs.total > 1 ? "tentatives détectées" : "tentative détectée"
              }
              accent
              ton="accent"
              part={1}
            />
            <Compteur
              label="Risque élevé"
              valeur={compteurs.eleve}
              detail="usurpation caractérisée"
              ton="danger"
              part={compteurs.total ? compteurs.eleve / compteurs.total : 0}
            />
            <Compteur
              label="Risque modéré"
              valeur={compteurs.modere}
              detail="signaux concordants"
              ton="warning"
              part={compteurs.total ? compteurs.modere / compteurs.total : 0}
            />
            <Compteur
              label="Risque faible"
              valeur={compteurs.faible}
              detail="à surveiller"
              ton="neutre"
              part={compteurs.total ? compteurs.faible / compteurs.total : 0}
            />
          </div>

          <div className="mt-6">
            <MenacesTable menaces={menaces} />
          </div>

          {menaces.length >= LIMITE && (
            <p className="mt-4 text-[12.5px] text-faint">
              Seules les {LIMITE} tentatives les plus récentes sont affichées.
            </p>
          )}
        </>
      )}
    </div>
  );
}

type TonCompteur = "accent" | "danger" | "warning" | "neutre";

/** Couleurs par ton : pastille, chiffre et barre de répartition. */
const TONS: Record<TonCompteur, { point: string; valeur: string; barre: string }> = {
  accent: { point: "bg-accent-text", valeur: "text-accent-text", barre: "bg-accent-text" },
  danger: { point: "bg-danger", valeur: "text-danger", barre: "bg-danger" },
  warning: { point: "bg-warning", valeur: "text-warning", barre: "bg-warning" },
  neutre: { point: "bg-muted", valeur: "text-foreground", barre: "bg-muted" },
};

/**
 * Tuile de compteur — même trame que les indicateurs du tableau de bord.
 *
 * Deux partis pris : un compteur à zéro s'estompe au lieu d'afficher un gros
 * chiffre coloré sans objet, et les tuiles de niveau portent une barre de
 * répartition qui situe leur part dans le total du mois.
 */
function Compteur({
  label,
  valeur,
  detail,
  accent = false,
  ton,
  part,
}: {
  label: string;
  valeur: number;
  detail: string;
  accent?: boolean;
  ton?: TonCompteur;
  part?: number;
}) {
  const vide = valeur === 0;
  const styles = TONS[ton ?? "neutre"];
  const couleurValeur = vide ? "text-faint" : styles.valeur;

  // La pastille distingue les trois niveaux de risque entre eux ; la tuile de
  // total, qui n'est pas un niveau, s'en passe.
  const avecPastille = ton !== undefined && ton !== "accent";

  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-4 ${
        accent ? "border-accent-line" : "border-border"
      }`}
    >
      <p className="flex items-center gap-2 text-[12px] text-foreground">
        {avecPastille && (
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.point} ${
              vide ? "opacity-30" : ""
            }`}
          />
        )}
        {label}
      </p>

      <p
        className={`tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] ${couleurValeur}`}
      >
        {valeur}
      </p>

      {/* Barre de répartition — présente sur toutes les tuiles pour que les
          libellés de bas de carte restent alignés d'une tuile à l'autre. */}
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${styles.barre} ${vide ? "opacity-0" : "opacity-80"}`}
          style={{ width: `${Math.round((part ?? 0) * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-[12px] text-muted">{detail}</p>
    </div>
  );
}

/** Aucune menace : on renvoie vers l'activation de l'extension. */
function EtatVide() {
  return (
    <Panel className="px-6 py-14 text-center">
      <h2 className="text-[17px] font-bold text-foreground">
        Aucune tentative détectée pour l&apos;instant
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">
        Les alertes apparaîtront ici dès que vos collaborateurs auront activé
        l&apos;extension Safentreprise Guard avec le code de votre société.
      </p>
      <Link href="/settings/extension" className={`${buttonPrimary} mt-7`}>
        Voir le code d&apos;activation
        <IconArrowRight />
      </Link>
    </Panel>
  );
}
