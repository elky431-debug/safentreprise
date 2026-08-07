/**
 * Envoi des messages de simulation et injection des liens de tracking.
 */
import { nomExpediteur } from "@/lib/templates/inject";
import type { TypeFraude } from "@/lib/types";

function baseAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** URL du lien « piège » (clic = a_clique). */
export function urlTracking(token: string): string {
  return `${baseAppUrl()}/t/${token}`;
}

/** URL du lien « signaler » (bon réflexe = a_signale). */
export function urlSignalement(token: string): string {
  return `${urlTracking(token)}?action=signaler`;
}

/**
 * Injecte {lien_tracking} et {lien_signalement}.
 * Si absents : ajoute un CTA piège + un lien discret « Signalez-le ».
 */
export function injecterLiensSuivi(
  html: string,
  lienPiege: string,
  lienSignaler: string,
): string {
  let out = html;

  if (out.includes("{lien_tracking}")) {
    out = out.split("{lien_tracking}").join(lienPiege);
  } else {
    const bouton =
      `<p style="margin:24px 0;text-align:center;">` +
      `<a href="${lienPiege}" style="display:inline-block;padding:12px 22px;` +
      `background:#0e8593;color:#ffffff;text-decoration:none;border-radius:6px;` +
      `font-size:14px;font-weight:600;">Ouvrir le document</a></p>`;
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>/i, `${bouton}</body>`)
      : `${out}${bouton}`;
  }

  if (out.includes("{lien_signalement}")) {
    out = out.split("{lien_signalement}").join(lienSignaler);
  }

  // Pied discret si le gabarit n'en contient pas déjà
  if (!out.includes("Signalez-le")) {
    const piedSignaler =
      `<p style="margin:16px 0 0;text-align:center;font-size:11px;line-height:1.4;color:#9ca3af;">` +
      `<a href="${lienSignaler}" style="color:#9ca3af;text-decoration:underline;">` +
      `Ce message vous semble suspect ? Signalez-le</a></p>`;
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>/i, `${piedSignaler}</body>`)
      : `${out}${piedSignaler}`;
  }

  return out;
}

/** @deprecated Utiliser injecterLiensSuivi */
export function injecterLienTracking(html: string, lien: string): string {
  return injecterLiensSuivi(html, lien, `${lien}?action=signaler`);
}

export function formaterExpediteurResend(
  typeFraude: TypeFraude,
  nomDirigeant: string,
  nomFournisseur: string | null,
  adresseTechnique: string,
): string {
  const nom = nomExpediteur(typeFraude, nomDirigeant, nomFournisseur);
  return `${nom} <${adresseTechnique}>`;
}
