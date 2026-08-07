import { createClient } from "@/lib/supabase/server";
import {
  CertificatesManager,
  type CampagneEligible,
  type CertificatLigne,
} from "@/components/certificates/CertificatesManager";

/**
 * Certificats / attestations de sensibilisation (société du user).
 */
export default async function CertificatesPage() {
  const supabase = await createClient();

  const { data: certs } = await supabase
    .from("certificates")
    .select("id, campaign_id, date_emission, url_pdf, campaigns(nom)")
    .order("date_emission", { ascending: false });

  const certificats: CertificatLigne[] = (certs ?? []).map((row) => {
    const campagne = row.campaigns as { nom: string } | { nom: string }[] | null;
    const nom = Array.isArray(campagne)
      ? campagne[0]?.nom
      : campagne?.nom;
    return {
      id: row.id,
      campaign_id: row.campaign_id,
      date_emission: row.date_emission,
      url_pdf: row.url_pdf,
      campagne_nom: nom ?? "Campagne",
    };
  });

  const dejaCouvertes = new Set(certificats.map((c) => c.campaign_id));

  const { data: envoyees } = await supabase
    .from("campaigns")
    .select("id, nom, date_lancement")
    .eq("statut", "envoyee")
    .order("date_lancement", { ascending: false });

  const eligibles: CampagneEligible[] = (envoyees ?? [])
    .filter((c) => !dejaCouvertes.has(c.id))
    .map((c) => ({
      id: c.id,
      nom: c.nom,
      date_envoi: c.date_lancement,
    }));

  return (
    <CertificatesManager certificats={certificats} eligibles={eligibles} />
  );
}
