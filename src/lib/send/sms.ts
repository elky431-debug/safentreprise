/**
 * Envoi SMS de simulation — non branché pour l'instant.
 *
 * TODO : brancher un fournisseur SMS (Twilio, Vonage, OVH, etc.)
 * et appeler cette fonction depuis POST /api/campaigns/[id]/send
 * pour les cibles dont le canal est SMS.
 */
export type CibleSms = {
  id: string;
  telephone: string | null;
  message: string;
  token: string | null;
};

export type ResultatEnvoiSms =
  | { ok: true }
  | { ok: false; raison: "sms_non_implemente" | "telephone_manquant" };

export async function sendSms(cible: CibleSms): Promise<ResultatEnvoiSms> {
  if (!cible.telephone?.trim()) {
    return { ok: false, raison: "telephone_manquant" };
  }

  // TODO: intégrer l'API SMS ici (ne pas appeler Resend).
  console.warn(
    `[SMS non implémenté] cible=${cible.id} tel=${cible.telephone}`,
  );
  return { ok: false, raison: "sms_non_implemente" };
}
