import { createClient } from "@/lib/supabase/server";
import { type MenacePourGraphique } from "@/components/dashboard/ActiviteProtection";
import { Releve, type CampagneListe } from "@/components/dashboard/Releve";
import { BandeauRaccordement } from "@/components/microsoft/BandeauRaccordement";
import { chargerScoreDynamique } from "@/lib/risk-dynamique";
import { appliquerSurveillanceAuScore } from "@/lib/risk-surveillance";
import { nombreBoitesSurveillees } from "@/lib/microsoft/etat";
import { lireRaccordement } from "@/lib/microsoft/parcours";
import { chargerAlertesGraph } from "@/lib/alertes";
import type { Company } from "@/lib/types";

/** Menaces chargées pour alimenter la courbe (les plus récentes). */
const LIMITE_MENACES = 2000;

/**
 * Tableau de bord — chargement des données uniquement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ L'AFFICHAGE EST DANS `@/components/dashboard/Releve`, ET LA SÉPARATION A
 *   UNE RAISON PRÉCISE. Ce composant-ci lit la session et la base : rien de ce
 *   qu'il rend ne peut donc être ouvert sans identifiants, donc rien ne peut
 *   être relu visuellement avant mise en ligne. `Releve` ne prend que des
 *   props : on lui passe un jeu fabriqué et on le regarde.
 *
 * ⚠ LES ALERTES VIENNENT DE `graph_analyses`, PAS DE `menaces_detectees`.
 *   Cet écran a longtemps lu la table de l'extension Chrome abandonnée : un
 *   client raccordé via Microsoft 365 voyait zéro menace alors que ses boîtes
 *   étaient bel et bien analysées.
 *
 * ⚠ LE BLOC « SOCIÉTÉ » A ÉTÉ SUPPRIMÉ, PAS DÉPLACÉ. Il affichait en lecture
 *   seule six champs — raison sociale, secteur, responsable, e-mail, dirigeant
 *   usurpé, mode résultats — qui sont TOUS déjà présents, et modifiables, sur
 *   `/settings/company`. Le recréer ailleurs n'aurait fait que rétablir la
 *   duplication ; l'écran de réglages existe et il est dans la barre latérale.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function DashboardPage() {
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

  const [
    { data: employeeRows },
    { data: campaignRows },
    menaces,
    raccordement,
    scoreDynamique,
  ] = await Promise.all([
    supabase.from("employees").select("id").eq("company_id", company.id),
    supabase
      .from("campaigns")
      .select("id, nom, statut, created_at, campaign_targets(id, message_final_html)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    chargerAlertesGraph(supabase, company.id, LIMITE_MENACES),
    // Alimente la couverture qui allège l'axe technique du score. L'appel est
    // mémoïsé : `BandeauRaccordement` lit le même état sans seconde requête.
    lireRaccordement(),
    chargerScoreDynamique(supabase, company.id),
  ]);

  const campaigns = (campaignRows ?? []) as CampagneListe[];
  const employes = employeeRows?.length ?? 0;
  // ⚠ LA COUVERTURE VIENT DES BOÎTES SURVEILLÉES, PLUS DE L'EXTENSION. L'axe
  //   technique était allégé à proportion des postes ayant activé l'extension
  //   Chrome, abandonnée : la couverture valait zéro chez tout client raccordé
  //   via Microsoft 365, dont les boîtes sont pourtant analysées à chaque
  //   message. La protection réelle ne comptait pour rien dans le calcul.
  //
  // ⚠ `nombreBoitesSurveillees` PLUTÔT QU'UN FILTRE ÉCRIT ICI. Il applique
  //   deux règles à la fois, et les deux comptent : une boîte cochée dont la
  //   surveillance n'a jamais démarré n'analyse rien, ET un locataire dont
  //   l'autorisation Microsoft est retirée n'analyse plus rien du tout. Sans
  //   la seconde, le taux d'exposition continuait d'afficher « −32 points
  //   grâce à la surveillance de vos boîtes » à un client qui n'était plus
  //   surveillé — le même mensonge d'interface que la vérification de santé
  //   corrige par ailleurs.
  const boitesSurveillees = nombreBoitesSurveillees(raccordement);

  // Le graphique n'a besoin que de la date et du niveau : on n'envoie pas le
  // reste au client.
  const menacesGraphique: MenacePourGraphique[] = menaces.map((m) => ({
    id: m.id,
    detecte_at: m.detecte_at,
    niveau_risque: m.niveau_risque,
  }));

  // Score : l'axe technique est allégé à proportion des boîtes surveillées.
  const scores = scoreDynamique.aQuestionnaire
    ? appliquerSurveillanceAuScore({
        procedures: scoreDynamique.procedures,
        humain: scoreDynamique.humain,
        techniqueBase: scoreDynamique.technique,
        boitesSurveillees,
        employes,
      })
    : null;

  return (
    <div className="w-full">
      {/* Un raccordement resté à mi-chemin ne doit pas passer inaperçu :
          le client croirait ses boîtes surveillées sans qu'elles le soient. */}
      <BandeauRaccordement />

      <Releve
        nomSociete={company.nom}
        menaces={menaces}
        menacesGraphique={menacesGraphique}
        scores={scores}
        boitesSurveillees={boitesSurveillees}
        employes={employes}
        campagnes={campaigns}
      />
    </div>
  );
}
