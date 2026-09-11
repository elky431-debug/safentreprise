/**
 * Alerte par email au dirigeant — risque élevé uniquement.
 *
 * Le TEXTE des deux emails vit dans `alerte-dirigeant-texte`, module sans
 * importation donc testable hors de Next. Ici : à qui, depuis quelle adresse,
 * et que faire quand ça rate.
 *
 * ⚠ CES EMAILS SORTENT DE L'UNION EUROPÉENNE. Resend est établi aux
 *   États-Unis : l'adresse du dirigeant, celle de la boîte visée et celle de
 *   l'expéditeur frauduleux y transitent. C'est le SEUL flux du produit dans
 *   ce cas, il est décrit dans l'AIPD, le registre des sous-traitants et la
 *   politique de confidentialité, et il est journalisé à chaque envoi. Toute
 *   donnée ajoutée à ces emails doit l'être dans ces documents le même jour,
 *   sans quoi ils décriraient un produit qui n'existe pas.
 *
 * ⚠ AUCUNE FONCTION DE CE FICHIER NE LÈVE. Une bannière posée est la
 *   protection ; l'email n'en est que l'écho. Une panne de Resend ne doit
 *   jamais faire échouer le traitement d'un message — l'appelant rend alors
 *   l'alerte à la file (`rendre_notification_alerte`) pour qu'elle reparte au
 *   passage suivant.
 */
import { envoyerEmail, type ResultatEnvoiEmail } from "@/lib/send/email";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";
import { EMAIL_CONTACT, TELEPHONE_AFFICHE } from "@/lib/contact";
import {
  alerteFictive,
  corpsAlerte,
  corpsResume,
  objetAlerte,
  objetResume,
  type AlerteANotifier,
  type ContexteTexte,
  type ResumeANotifier,
} from "@/lib/microsoft/alerte-dirigeant-texte";

export {
  alerteFictive,
  type AlerteANotifier,
  type ResumeANotifier,
};

const VARIABLES_EXPEDITEUR = [
  "ALERTE_FROM_EMAIL",
  "VEILLE_FROM_EMAIL",
  "DEMO_FROM_EMAIL",
];

/**
 * Les coordonnées viennent de la source unique ; le lien vers la console est
 * lu à l'envoi, pas au chargement du module — un déploiement peut changer
 * `NEXT_PUBLIC_APP_URL` sans redémarrage.
 */
function contexteTexte(): ContexteTexte {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return {
    telephone: TELEPHONE_AFFICHE,
    email: EMAIL_CONTACT,
    lienMenaces: base ? `${base}/menaces` : "votre tableau de bord Safentreprise",
  };
}

export type ResultatAlerte = {
  destinataires: number;
  envoyes: number;
  erreur?: string;
};

/**
 * Envoie un email à chaque destinataire. Ne lève jamais.
 *
 * ⚠ « ENVOYÉ » VEUT DIRE « AU MOINS UN DESTINATAIRE SERVI ». Une société sans
 *   destinataire joignable, ou une garde d'expéditeur qui refuse, comptent
 *   comme un échec : l'appelant rendra l'alerte à la file plutôt que de la
 *   consommer pour rien.
 */
async function envoyerA(
  destinataires: string[],
  objet: string,
  texte: string,
): Promise<ResultatAlerte> {
  if (destinataires.length === 0) {
    return {
      destinataires: 0,
      envoyes: 0,
      erreur: "aucun destinataire pour cette société",
    };
  }

  const from = expediteurVerifie(VARIABLES_EXPEDITEUR);
  if (!from) {
    return {
      destinataires: destinataires.length,
      envoyes: 0,
      erreur: erreurExpediteur(VARIABLES_EXPEDITEUR),
    };
  }

  let envoyes = 0;
  const erreurs: string[] = [];

  // Séquentiel : l'échec de l'un ne doit pas masquer le sort de l'autre dans
  // les journaux, et le volume ne justifie aucun parallélisme.
  for (const destinataire of destinataires) {
    const r: ResultatEnvoiEmail = await envoyerEmail({
      from: `Safentreprise <${from}>`,
      to: destinataire,
      subject: objet,
      text: texte,
      // Répondre à une alerte doit écrire à un humain, pas à la boîte
      // technique d'expédition.
      replyTo: EMAIL_CONTACT,
    });
    if (r.ok) envoyes += 1;
    else erreurs.push(r.erreur);
  }

  return {
    destinataires: destinataires.length,
    envoyes,
    erreur: envoyes === 0 ? erreurs.join(" | ").slice(0, 300) : undefined,
  };
}

export function envoyerAlerteDirigeant(
  destinataires: string[],
  alerte: AlerteANotifier,
): Promise<ResultatAlerte> {
  const c = contexteTexte();
  return envoyerA(destinataires, objetAlerte(), corpsAlerte(alerte, c));
}

export function envoyerResumeDirigeant(
  destinataires: string[],
  resume: ResumeANotifier,
): Promise<ResultatAlerte> {
  const c = contexteTexte();
  return envoyerA(destinataires, objetResume(resume.nombre), corpsResume(resume, c));
}
