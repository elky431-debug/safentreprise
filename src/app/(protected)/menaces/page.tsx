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
            />
            <Compteur
              label="Risque élevé"
              valeur={compteurs.eleve}
              detail="usurpation caractérisée"
              ton="danger"
            />
            <Compteur
              label="Risque modéré"
              valeur={compteurs.modere}
              detail="signaux concordants"
              ton="warning"
            />
            <Compteur
              label="Risque faible"
              valeur={compteurs.faible}
              detail="à surveiller"
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

/** Tuile de compteur — même trame que les indicateurs du tableau de bord. */
function Compteur({
  label,
  valeur,
  detail,
  accent = false,
  ton,
}: {
  label: string;
  valeur: number;
  detail: string;
  accent?: boolean;
  ton?: "danger" | "warning";
}) {
  const couleurValeur =
    ton === "danger"
      ? "text-danger"
      : ton === "warning"
        ? "text-warning"
        : accent
          ? "text-accent-text"
          : "text-foreground";

  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-4 ${
        accent ? "border-accent-line" : "border-border"
      }`}
    >
      <p className="text-[12px] text-foreground">{label}</p>
      <p
        className={`tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] ${couleurValeur}`}
      >
        {valeur}
      </p>
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
