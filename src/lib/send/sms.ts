/**
 * Envoi SMS de simulation via SMS Partner (serveur uniquement).
 *
 * Doc officielle (envoi unitaire) :
 *   POST https://api.smspartner.fr/v1/send
 *   Body JSON : apiKey, phoneNumbers, message, sender (optionnel)
 *   Auth : clé API dans le corps (pas de Bearer).
 *
 * @see https://www.docpartner.dev/api/sms-partner/envoyer-des-sms/envoi-unitaire
 */
import { urlTracking } from "@/lib/send/tracking";

const SMS_PARTNER_URL = "https://api.smspartner.fr/v1/send";

export type CibleSms = {
  id: string;
  telephone: string | null;
  /** Texte du SMS (stocké dans message_final_html côté DB). */
  message: string;
  token: string | null;
};

export type RaisonEchecSms =
  | "telephone_manquant"
  | "telephone_invalide"
  | "token_manquant"
  | "config_manquante"
  | "quota_epuise"
  | "numero_invalide_api"
  | "erreur_api"
  | "reseau";

export type ResultatEnvoiSms =
  | { ok: true; messageId: string | number; nbSms?: number }
  | { ok: false; raison: RaisonEchecSms; detail: string };

type ReponseSmsPartner = {
  success?: boolean;
  code?: number;
  message_id?: string | number;
  nb_sms?: number;
  nbSMS?: number;
  cost?: number;
  currency?: string;
  message?: string;
  errors?: { elementId?: string; message?: string }[];
  error?: { elementId?: string; message?: string }[] | string;
};

/**
 * Envoie un SMS de simulation à une cible.
 * Un échec ne doit jamais faire planter la boucle d'envoi appelante.
 */
export async function sendSms(cible: CibleSms): Promise<ResultatEnvoiSms> {
  const apiKey = process.env.SMSPARTNER_API_KEY?.trim();
  const sender = process.env.SMSPARTNER_SENDER?.trim();

  if (!apiKey) {
    const detail = "SMSPARTNER_API_KEY manquante côté serveur.";
    console.error(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "config_manquante", detail };
  }

  if (!sender) {
    const detail = "SMSPARTNER_SENDER manquant côté serveur.";
    console.error(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "config_manquante", detail };
  }

  if (!cible.token?.trim()) {
    const detail = "Token de suivi manquant.";
    console.error(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "token_manquant", detail };
  }

  const brut = cible.telephone?.trim() ?? "";
  if (!brut) {
    const detail = "Numéro de téléphone manquant.";
    console.warn(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "telephone_manquant", detail };
  }

  const telephone = normaliserTelephoneFr(brut);
  if (!telephone) {
    const detail = `Numéro invalide : « ${brut} ».`;
    console.warn(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "telephone_invalide", detail };
  }

  const lien = urlTracking(cible.token);
  const message = preparerMessageSms(cible.message, lien);

  if (!message.trim()) {
    const detail = "Message SMS vide après préparation.";
    console.error(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "erreur_api", detail };
  }

  // Placeholders non remplacés → lien mort, on refuse l'envoi
  if (
    message.includes("{lien_tracking}") ||
    message.includes("{lien_signalement}")
  ) {
    const detail =
      "Placeholders de lien restants dans le SMS. Recomposez puis renvoyez.";
    console.error(`[SMS] cible=${cible.id} — ${detail}`);
    return { ok: false, raison: "erreur_api", detail };
  }

  try {
    const corps = {
      apiKey,
      phoneNumbers: telephone,
      sender,
      message,
      // Simulation pédagogique consentie — pas de campagne marketing STOP
      // (isStopSms volontairement omis).
    };

    const reponse = await fetch(SMS_PARTNER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cache-control": "no-cache",
      },
      body: JSON.stringify(corps),
    });

    const texte = await reponse.text();
    let data: ReponseSmsPartner = {};
    try {
      data = JSON.parse(texte) as ReponseSmsPartner;
    } catch {
      const detail = `Réponse non-JSON (HTTP ${reponse.status}) : ${texte.slice(0, 200)}`;
      console.error(`[SMS] cible=${cible.id} tel=${telephone} — ${detail}`);
      return { ok: false, raison: "erreur_api", detail };
    }

    if (data.success === true && (data.code === 200 || reponse.ok)) {
      const messageId = data.message_id ?? "ok";
      console.info(
        `[SMS] OK cible=${cible.id} tel=${telephone} message_id=${messageId}`,
      );
      return {
        ok: true,
        messageId,
        nbSms: data.nb_sms ?? data.nbSMS,
      };
    }

    const { raison, detail } = interpreterErreurSmsPartner(data, reponse.status);
    console.error(
      `[SMS] ÉCHEC cible=${cible.id} tel=${telephone} code=${data.code ?? reponse.status} — ${detail}`,
    );
    return { ok: false, raison, detail };
  } catch (e) {
    const detail =
      e instanceof Error ? e.message : "Erreur réseau SMS Partner inconnue";
    console.error(`[SMS] cible=${cible.id} — réseau :`, detail);
    return { ok: false, raison: "reseau", detail };
  }
}

/**
 * Normalise un numéro FR vers +33… (accepte 06…, 0033…, +33…).
 * Retourne null si le numéro n'est pas utilisable.
 */
export function normaliserTelephoneFr(brut: string): string | null {
  const digits = brut.replace(/[\s.\-()]/g, "");

  // +33612345678
  if (/^\+33[1-9]\d{8}$/.test(digits)) {
    return digits;
  }

  // 0033612345678
  if (/^0033[1-9]\d{8}$/.test(digits)) {
    return `+${digits.slice(2)}`;
  }

  // 0612345678
  if (/^0[1-9]\d{8}$/.test(digits)) {
    return `+33${digits.slice(1)}`;
  }

  // International hors FR déjà au format E.164 (+ puis 8–15 chiffres)
  if (/^\+[1-9]\d{7,14}$/.test(digits)) {
    return digits;
  }

  return null;
}

/**
 * Prépare le texte SMS : injecte le lien de tracking et adapte
 * les sauts de ligne au format SMS Partner (`:br:`).
 */
export function preparerMessageSms(brut: string, lienPiege: string): string {
  let texte = brut;

  // Retire un éventuel HTML léger (au cas où un gabarit email aurait fuité)
  texte = texte
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  if (texte.includes("{lien_tracking}")) {
    texte = texte.split("{lien_tracking}").join(lienPiege);
  } else if (!texte.includes(lienPiege)) {
    // Garantit le lien pédagogique même si le gabarit l'omets
    texte = `${texte.trim()}\n${lienPiege}`;
  }

  if (texte.includes("{lien_signalement}")) {
    texte = texte
      .split("{lien_signalement}")
      .join(`${lienPiege}?action=signaler`);
  }

  // Doc SMS Partner : saut de ligne → :br:
  texte = texte.replace(/\r\n|\r|\n/g, ":br:");

  // Symbole € → :euro: (doc)
  texte = texte.replace(/€/g, ":euro:");

  return texte.trim();
}

/** Mappe les codes d'erreur documentés vers des raisons métier. */
function interpreterErreurSmsPartner(
  data: ReponseSmsPartner,
  httpStatus: number,
): { raison: RaisonEchecSms; detail: string } {
  const code = data.code;
  const messagesErreur = extraireMessagesErreur(data);

  if (code === 11) {
    return {
      raison: "quota_epuise",
      detail: messagesErreur || "Crédit SMS insuffisant (code 11).",
    };
  }

  if (code === 2 || code === 9 || code === 55) {
    const detail =
      messagesErreur ||
      (code === 9
        ? "Contrainte non respectée (numéro ou expéditeur invalide)."
        : "Numéro de téléphone invalide ou manquant.");
    // Distingue un numéro invalide mentionné dans les erreurs
    const numeroInvalide = /phone|num[eé]ro|valid/i.test(detail);
    return {
      raison: numeroInvalide ? "numero_invalide_api" : "erreur_api",
      detail,
    };
  }

  if (code === 44 || code === 992) {
    return {
      raison: "erreur_api",
      detail: messagesErreur || "Expéditeur SMS non autorisé.",
    };
  }

  if (code === 1 || code === 10 || code === 40) {
    return {
      raison: "config_manquante",
      detail: messagesErreur || "Clé API SMS Partner invalide ou refusée.",
    };
  }

  return {
    raison: "erreur_api",
    detail:
      messagesErreur ||
      data.message ||
      `Erreur SMS Partner (code ${code ?? httpStatus}).`,
  };
}

function extraireMessagesErreur(data: ReponseSmsPartner): string {
  const liste = data.errors ?? (Array.isArray(data.error) ? data.error : null);
  if (liste?.length) {
    return liste
      .map((e) => e.message)
      .filter(Boolean)
      .join(" · ");
  }
  if (typeof data.error === "string") return data.error;
  return "";
}
