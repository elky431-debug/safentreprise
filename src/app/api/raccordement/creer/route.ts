/**
 * Crée le lien de raccordement et l'envoie à l'informaticien.
 *
 * ⚠ LE LIEN EST CRÉÉ MÊME SI LE MAIL NE PART PAS, ET LA RÉPONSE LE DIT. Une
 *   version qui échouerait en bloc laisserait le dirigeant sans lien ET sans
 *   message, devant une erreur qu'il ne peut pas corriger. Ici il garde le
 *   lien, qu'il peut copier et transmettre autrement — c'est exactement le
 *   recours dont il a besoin ce jour-là.
 */
import { createClient } from "@/lib/supabase/server";
import { envoyerEmail } from "@/lib/send/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function echapper(t: string): string {
  return t
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function POST(requete: Request) {
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ erreur: "corps illisible" }, { status: 400 });
  }

  const nom = typeof corps.nom === "string" ? corps.nom.trim() : "";
  const email = typeof corps.email === "string" ? corps.email.trim() : "";
  const mot = typeof corps.mot === "string" ? corps.mot.trim() : "";
  const adresses = Array.isArray(corps.adresses)
    ? corps.adresses
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!email.includes("@")) {
    return Response.json(
      { erreur: "Indiquez l’adresse email de votre informaticien." },
      { status: 400 },
    );
  }
  if (adresses.length === 0) {
    return Response.json(
      { erreur: "Indiquez au moins une boîte à surveiller." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creer_jeton_raccordement", {
    p_destinataire_nom: nom || null,
    p_destinataire_email: email,
    p_adresses: adresses,
    p_mot: mot || null,
  });

  if (error) {
    console.error("[raccordement] creer_jeton_raccordement :", error);
    return Response.json({ erreur: error.message }, { status: 400 });
  }

  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { jeton?: string }
    | undefined;
  if (!ligne?.jeton) {
    return Response.json({ erreur: "lien non délivré" }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const lien = `${base}/raccordement/${ligne.jeton}`;

  // Le nom de la société, pour que l'informaticien sache de qui ça vient.
  const { data: societe } = await supabase
    .from("companies")
    .select("nom, nom_dirigeant")
    .maybeSingle();
  const s = (societe as { nom?: string; nom_dirigeant?: string } | null) ?? {};

  const from = process.env.VEILLE_FROM_EMAIL ?? "onboarding@resend.dev";
  const envoi = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: email,
    subject: `${s.nom ?? "Une entreprise"} — raccorder Microsoft 365 à Safentreprise`,
    html:
      `<p>Bonjour${nom ? " " + echapper(nom) : ""},</p>` +
      `<p><strong>${echapper(s.nom_dirigeant ?? "Le dirigeant")}</strong>, de ` +
      `<strong>${echapper(s.nom ?? "son entreprise")}</strong>, vous demande de ` +
      `raccorder Microsoft 365 à Safentreprise.</p>` +
      (mot ? `<p><em>« ${echapper(mot)} »</em></p>` : "") +
      `<p>Tout est sur cette page — 3 étapes, une quinzaine de minutes, ` +
      `plus une heure d'attente côté Microsoft. Aucun compte à créer.</p>` +
      `<p><a href="${lien}">${lien}</a></p>` +
      `<p style="color:#6b7686;font-size:13px;">Ce lien est valable 14 jours. ` +
      `Il ne donne accès qu'au raccordement, à rien d'autre.</p>`,
  });

  // ⚠ 200 MÊME SI LE MAIL A ÉCHOUÉ. Le lien existe : c'est l'essentiel, et
  //   l'écran affiche l'échec avec le lien à copier.
  return Response.json({
    jeton: ligne.jeton,
    lien,
    mail_envoye: envoi.ok,
    mail_erreur: envoi.ok ? null : envoi.erreur,
  });
}
