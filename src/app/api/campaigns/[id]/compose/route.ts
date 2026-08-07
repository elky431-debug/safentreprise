/**
 * Compose les messages finaux d'une campagne à partir des gabarits HTML/SMS.
 * Remplace l'ancienne génération IA.
 *
 * POST /api/campaigns/[id]/compose
 */
import { createClient } from "@/lib/supabase/server";
import { canauxDeCampagne, typesFraudeDeCampagne } from "@/lib/campaigns";
import { injecterVariables } from "@/lib/templates/inject";
import type {
  Branding,
  Campaign,
  CanalMessage,
  Company,
  Employee,
  MessageTemplate,
  Supplier,
  TypeFraude,
} from "@/lib/types";

type CibleLue = {
  id: string;
  employee_id: string;
  employees: Pick<Employee, "prenom" | "email" | "telephone"> | null;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ erreur: "Session expirée." }, { status: 401 });
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle<Campaign>();

  if (!campaign) {
    return Response.json({ erreur: "Campagne introuvable." }, { status: 404 });
  }

  if (campaign.statut === "envoyee") {
    return Response.json(
      { erreur: "Cette campagne a déjà été envoyée." },
      { status: 409 },
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", campaign.company_id)
    .maybeSingle<Company>();

  if (!company) {
    return Response.json({ erreur: "Société introuvable." }, { status: 404 });
  }

  const [{ data: branding }, { data: supplier }, { data: cibles }] =
    await Promise.all([
      supabase
        .from("branding")
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle<Branding>(),
      campaign.supplier_id
        ? supabase
            .from("suppliers")
            .select("*")
            .eq("id", campaign.supplier_id)
            .maybeSingle<Supplier>()
        : Promise.resolve({ data: null }),
      supabase
        .from("campaign_targets")
        .select("id, employee_id, employees(prenom, email, telephone)")
        .eq("campaign_id", campaign.id)
        .returns<CibleLue[]>(),
    ]);

  if (!cibles || cibles.length === 0) {
    return Response.json(
      { erreur: "Aucun collaborateur n'est ciblé par cette campagne." },
      { status: 400 },
    );
  }

  if (campaign.type_fraude === "fournisseur" && !supplier) {
    return Response.json(
      { erreur: "Sélectionnez un fournisseur pour ce scénario." },
      { status: 400 },
    );
  }

  // Un gabarit actif par combinaison type × canal
  const types = typesFraudeDeCampagne(campaign.type_fraude);
  const canaux = canauxDeCampagne(campaign.canal);
  const gabarits = new Map<string, MessageTemplate>();

  for (const typeFraude of types) {
    for (const canal of canaux) {
      const { data: template } = await supabase
        .from("message_templates")
        .select("*")
        .eq("type_fraude", typeFraude)
        .eq("canal", canal)
        .eq("actif", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<MessageTemplate>();

      if (!template) {
        return Response.json(
          {
            erreur: `Aucun gabarit actif pour ${typeFraude} / ${canal}. Contactez Safentreprise.`,
          },
          { status: 400 },
        );
      }

      gabarits.set(`${typeFraude}-${canal}`, template);
    }
  }

  const couleur = branding?.couleur_principale ?? "#0e8593";
  const signatureHtml = branding?.signature_html ?? "";
  const logoUrl = branding?.logo_url ?? null;
  const nomFournisseur = supplier?.nom ?? "";

  let composees = 0;

  for (const cible of cibles) {
    const rawEmploye = cible.employees as unknown;
    const employe = Array.isArray(rawEmploye)
      ? rawEmploye[0]
      : rawEmploye;
    if (!employe) continue;

    // Canal concret pour cette cible
    let canalCible: CanalMessage | null = null;
    if (campaign.canal === "email") {
      canalCible = "email";
    } else if (campaign.canal === "sms") {
      canalCible = employe.telephone ? "sms" : null;
    } else {
      // Legacy « les_deux » : email par défaut, SMS si pas d'email possible
      canalCible = "email";
    }

    if (!canalCible) continue;

    const typeFraude: TypeFraude = types[0];
    const template =
      gabarits.get(`${typeFraude}-${canalCible}`) ??
      gabarits.get(`${typeFraude}-email`);

    if (!template) continue;

    const variables = {
      logoUrl,
      entreprise: company.nom,
      nomDirigeant: company.nom_dirigeant,
      nomFournisseur,
      prenomEmploye: employe.prenom,
      signatureHtml,
      couleur,
    };

    const messageFinal = injecterVariables(template.contenu_html, variables);
    const objetFinal =
      canalCible === "email" && template.objet
        ? injecterVariables(template.objet, variables)
        : null;

    const { error } = await supabase
      .from("campaign_targets")
      .update({
        template_id: template.id,
        message_final_html: messageFinal,
        objet_final: objetFinal,
        // Nouveau brouillon : le token sera créé à la validation
        token_unique: null,
      })
      .eq("id", cible.id);

    if (error) {
      console.error("Composition cible :", error);
      return Response.json(
        { erreur: "La composition des messages a échoué." },
        { status: 500 },
      );
    }

    composees += 1;
  }

  if (composees === 0) {
    return Response.json(
      {
        erreur:
          "Aucun message composé. Vérifiez les téléphones pour le canal SMS.",
      },
      { status: 400 },
    );
  }

  // Repasse en brouillon si on recomposait une campagne déjà « prête »
  if (campaign.statut === "prete") {
    await supabase
      .from("campaigns")
      .update({ statut: "brouillon" })
      .eq("id", campaign.id);
  }

  return Response.json({ composees });
}
