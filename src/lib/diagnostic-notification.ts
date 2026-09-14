/**
 * L'envoi des deux emails du diagnostic.
 *
 * Le contenu vit dans `diagnostic-email`, module testable hors de Next. Ici :
 * à qui, depuis quelle adresse, et que faire quand ça échoue.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ AUCUNE DE CES FONCTIONS NE LÈVE. Un diagnostic enregistré est acquis ;
 *   l'email n'en est que l'écho. Les échecs sont rendus, jamais propagés — la
 *   route les consigne et répond quand même.
 *
 * ⚠ LES DEUX ENVOIS SONT ATTENDUS, PAS LANCÉS EN ARRIÈRE-PLAN. Sur une
 *   plateforme sans serveur, la fonction est gelée dès que la réponse part :
 *   un `void envoyer()` non attendu est tué avant d'atteindre Resend une fois
 *   sur deux, sans la moindre trace. Mieux vaut une réponse plus lente d'une
 *   seconde qu'un email perdu au hasard.
 *
 * ⚠ L'EXPÉDITEUR NE PEUT PAS ÊTRE UNE ADRESSE GRAND PUBLIC. La garde partagée
 *   `expediteurVerifie` refuse l'envoi plutôt que de laisser partir un message
 *   qui finirait en indésirable.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { envoyerEmail, type ResultatEnvoiEmail } from "@/lib/send/email";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";
import { EMAIL_CONTACT } from "@/lib/contact";
import type { Reponses } from "@/lib/diagnostic";
import {
  corpsInterne,
  htmlProspect,
  sujetInterne,
  sujetProspect,
  texteProspect,
  type ContexteEmail,
  type Coordonnees,
} from "@/lib/diagnostic-email";

/**
 * Variables consultées, dans l'ordre, pour l'adresse d'expédition.
 *
 * ⚠ UNE VARIABLE DÉDIÉE EN TÊTE. Sans elle, changer l'expéditeur du diagnostic
 *   changerait aussi celui des demandes de démo — deux flux qu'on peut vouloir
 *   séparer le jour où l'un d'eux est mis en cause par un filtre.
 */
const VARIABLES_EXPEDITEUR = [
  "DIAGNOSTIC_FROM_EMAIL",
  "DEMO_FROM_EMAIL",
  "VEILLE_FROM_EMAIL",
];

/**
 * Destinataire de la fiche interne.
 *
 * ⚠ PAR VARIABLE D'ENVIRONNEMENT, JAMAIS EN DUR dans le code d'une route. La
 *   dernière valeur de la chaîne est l'adresse de contact publique du produit :
 *   c'est un filet, pas une configuration — si on y tombe, c'est qu'aucune
 *   variable n'est posée.
 */
export function destinataireInterne(): string {
  return (
    process.env.DIAGNOSTIC_NOTIFICATION_EMAIL?.trim() ||
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    process.env.VEILLE_DESTINATAIRE?.trim() ||
    EMAIL_CONTACT
  );
}

/** Adresse publique du site, pour les liens des emails. */
function contexte(): ContexteEmail {
  const brut =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://safentreprise.com";

  return {
    contact: EMAIL_CONTACT,
    // Une barre finale doublerait les barres des liens construits ensuite.
    siteUrl: brut.replace(/\/+$/, ""),
  };
}

export type ResultatNotificationDiagnostic = {
  interne: ResultatEnvoiEmail;
  /** Absent quand le répondant n'a pas laissé ses coordonnées. */
  analyse?: ResultatEnvoiEmail;
};

/**
 * Envoie la fiche interne, et l'analyse au prospect s'il a laissé ses
 * coordonnées.
 *
 * ⚠ LES ENVOIS SONT SÉQUENTIELS. `Promise.all` ne ferait rien gagner de
 *   sensible et mélangerait les deux échecs dans les logs ; on veut savoir
 *   lequel des deux est tombé.
 */
export async function notifierDiagnostic(
  score: number,
  reponses: Reponses,
  coordonnees: Coordonnees | null,
): Promise<ResultatNotificationDiagnostic> {
  const from = expediteurVerifie(VARIABLES_EXPEDITEUR);

  if (!from) {
    const erreur = erreurExpediteur(VARIABLES_EXPEDITEUR);
    return {
      interne: { ok: false, erreur },
      ...(coordonnees ? { analyse: { ok: false as const, erreur } } : {}),
    };
  }

  const c = contexte();

  const interne = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: destinataireInterne(),
    subject: sujetInterne(score, reponses, coordonnees),
    text: corpsInterne(score, reponses, coordonnees),
    // Répondre à la fiche écrit au prospect, pas à la boîte technique.
    replyTo: coordonnees?.email,
  });

  if (!coordonnees) {
    return { interne };
  }

  const analyse = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: coordonnees.email,
    subject: sujetProspect(score),
    html: htmlProspect(score, reponses, coordonnees, c),
    text: texteProspect(score, reponses, coordonnees, c),
    replyTo: EMAIL_CONTACT,
  });

  return { interne, analyse };
}
