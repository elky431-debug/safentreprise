/**
 * Envoi email via Resend (serveur uniquement).
 */
import { Resend } from "resend";

export type ResultatEnvoiEmail =
  | { ok: true; id: string }
  | { ok: false; erreur: string };

/** Client Resend lazy (évite de planter au build si la clé manque). */
function clientResend(): Resend {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    throw new Error("RESEND_API_KEY manquante dans .env.local");
  }
  return new Resend(cle);
}

export async function envoyerEmailSimulation(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<ResultatEnvoiEmail> {
  try {
    const resend = clientResend();
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      return { ok: false, erreur: error.message };
    }

    return { ok: true, id: data?.id ?? "ok" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Resend inconnue";
    return { ok: false, erreur: message };
  }
}
