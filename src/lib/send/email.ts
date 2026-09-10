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

export type EmailAEnvoyer = {
  from: string;
  to: string;
  subject: string;
  /** Au moins l'un des deux doit être fourni. */
  html?: string;
  text?: string;
  /** Adresse à laquelle la réponse doit partir, si différente de `from`. */
  replyTo?: string;
};

/**
 * Envoi générique. Ne lève jamais : toute erreur revient en `{ ok: false }`.
 *
 * ⚠ C'EST L'APPELANT QUI DÉCIDE SI UN ÉCHEC EST GRAVE. Une notification
 *   d'alerte peut être perdue sans conséquence ; un email de campagne, non.
 *   D'où un résultat rendu plutôt qu'une exception.
 */
export async function envoyerEmail(
  params: EmailAEnvoyer,
): Promise<ResultatEnvoiEmail> {
  try {
    const resend = clientResend();
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      // Le SDK exige html ou text ; on garde un corps vide plutôt que
      // `undefined`, qui ferait échouer la validation côté Resend.
      html: params.html,
      text: params.text ?? (params.html ? undefined : ""),
      // ⚠ `replyTo` EN CAMELCASE. Le SDK Resend accepte cette forme et la
      //   traduit en en-tête `Reply-To` ; la clé `reply_to` de l'API HTTP
      //   brute serait ignorée ici, sans erreur, et la réponse partirait vers
      //   l'expéditeur technique.
      replyTo: params.replyTo,
    } as Parameters<Resend["emails"]["send"]>[0]);

    if (error) {
      return { ok: false, erreur: error.message };
    }

    return { ok: true, id: data?.id ?? "ok" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Resend inconnue";
    return { ok: false, erreur: message };
  }
}

/**
 * Envoi d'un message de simulation.
 * Conservé pour les appelants existants ; délègue à `envoyerEmail`.
 */
export async function envoyerEmailSimulation(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<ResultatEnvoiEmail> {
  return envoyerEmail(params);
}
