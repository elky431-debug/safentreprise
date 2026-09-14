import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MenacesStats } from "@/components/menaces/MenacesStats";
import { MenacesTable } from "@/components/menaces/MenacesTable";
import { PageHeader, Panel, buttonPrimary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { chargerAlertesGraph } from "@/lib/alertes";
import type { Company } from "@/lib/types";

/** Nombre d'alertes chargées (les plus récentes). */
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

/**
 * Tentatives repérées sur les boîtes Microsoft 365 raccordées.
 *
 * ⚠ CETTE PAGE A LONGTEMPS LU `menaces_detectees`, alimentée par l'extension
 *   Chrome abandonnée. Le pipeline Graph écrivant dans `graph_analyses`, un
 *   client raccordé voyait un écran vide qui lui conseillait d'installer une
 *   extension. Les anciennes lignes ne sont plus affichées du tout : elles
 *   s'éteindront avec leur purge à douze mois.
 */
/** Niveaux acceptés dans `?niveau=` — tout le reste est ignoré. */
const NIVEAUX_URL = ["eleve", "modere", "faible"] as const;

type NiveauUrl = (typeof NIVEAUX_URL)[number];

function niveauDepuisUrl(valeur: string | string[] | undefined): NiveauUrl | undefined {
  return typeof valeur === "string" && (NIVEAUX_URL as readonly string[]).includes(valeur)
    ? (valeur as NiveauUrl)
    : undefined;
}

export default async function MenacesPage({
  searchParams,
}: PageProps<"/menaces">) {
  const params = await searchParams;
  const niveauInitial = niveauDepuisUrl(params.niveau);
  const alerteInitiale =
    typeof params.alerte === "string" ? params.alerte : null;

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

  const alertes = await chargerAlertesGraph(supabase, company.id, LIMITE);

  const debutMois = debutDuMoisIso();
  const duMois = alertes.filter((a) => a.detecte_at >= debutMois);

  const compteurs = {
    total: duMois.length,
    eleve: duMois.filter((a) => a.niveau_risque === "eleve").length,
    modere: duMois.filter((a) => a.niveau_risque === "modere").length,
    faible: duMois.filter((a) => a.niveau_risque === "faible").length,
  };

  return (
    <div className="w-full">
      {/* ⚠ CETTE PHRASE A ÉTÉ CORRIGÉE PARCE QU'ELLE ÉTAIT FAUSSE. Elle
          annonçait « Aucun contenu de message n'est conservé », alors que
          `graph_analyses.objet` conserve bel et bien l'objet — 12 mois sur une
          alerte, 30 jours sinon, et l'AIPD le documente noir sur blanc
          (tableau des données, ligne « Contenu de message »). Une promesse de
          conservation fausse dans l'interface ne se défend pas en audit.
          La garantie exacte, et elle tient : c'est le CORPS qui n'est jamais
          conservé. */}
      <PageHeader
        title="Menaces"
        description="Les tentatives repérées sur les boîtes que vous avez choisi de faire surveiller. Le corps des messages n'est jamais conservé ; l'objet l'est pour une durée limitée."
      />

      {alertes.length === 0 ? (
        <EtatVide />
      ) : (
        <>
          <MenacesStats
            total={compteurs.total}
            eleve={compteurs.eleve}
            modere={compteurs.modere}
            faible={compteurs.faible}
          />

          <div className="mt-5">
            <MenacesTable
              alertes={alertes}
              niveauInitial={niveauInitial}
              alerteInitiale={alerteInitiale}
            />
          </div>

          {alertes.length >= LIMITE && (
            <p className="mt-4 text-[12.5px] text-faint">
              Seules les {LIMITE} tentatives les plus récentes sont affichées.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Aucune alerte : on renvoie vers l'état du raccordement.
 *
 * ⚠ AUCUNE MENTION D'EXTENSION ICI. Il n'y a rien à installer : la protection
 *   passe par le raccordement Microsoft 365. L'ancien texte envoyait le client
 *   chercher un code d'activation pour un produit qui n'existe plus.
 */
function EtatVide() {
  return (
    <Panel className="px-6 py-14 text-center">
      <h2 className="text-[17px] font-bold text-foreground">
        Aucune tentative détectée pour l&apos;instant
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">
        La surveillance est en place sur les boîtes que vous avez choisies.
        Chaque message qui y arrive est analysé, et les tentatives de fraude
        apparaîtront ici — sans que vos collaborateurs aient rien à installer.
      </p>
      <Link href="/microsoft" className={`${buttonPrimary} mt-7`}>
        Voir les boîtes surveillées
        <IconArrowRight />
      </Link>
    </Panel>
  );
}
