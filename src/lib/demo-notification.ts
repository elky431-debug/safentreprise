/**
 * Les deux emails déclenchés par une demande de démonstration.
 *
 * ⚠ AUCUNE DE CES FONCTIONS NE LÈVE. Une demande enregistrée est acquise ;
 *   l'email n'en est que l'écho. Un échec Resend est consigné et rendu, jamais
 *   propagé — voir l'ordre imposé dans /api/demo : enregistrer, puis notifier.
 *
 * ⚠ L'EXPÉDITEUR NE PEUT PAS ÊTRE UNE ADRESSE GRAND PUBLIC. Resend refuse
 *   d'expédier depuis un domaine non vérifié, et un envoi « de » gmail.com
 *   serait de toute façon rejeté par la plupart des serveurs destinataires au
 *   titre de DMARC. La garde ci-dessous refuse l'envoi plutôt que de laisser
 *   partir un message qui finirait en indésirable.
 */
import { envoyerEmail, type ResultatEnvoiEmail } from "@/lib/send/email";
import { EMAIL_CONTACT, TELEPHONE_AFFICHE } from "@/lib/contact";

/** Ce qu'une demande contient, une fois validée par la route. */
export type DemandeDemo = {
  entreprise: string;
  effectif: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  microsoft365: string;
  besoin: string;
};

/** Domaine seul autorisé à expédier. */
const DOMAINE_EXPEDITEUR = "safentreprise.com";

/**
 * Adresse d'expédition.
 *
 * ⚠ ELLE DOIT ÊTRE VÉRIFIÉE CHEZ RESEND, sans quoi l'envoi échoue. En
 *   développement, `onboarding@resend.dev` ne peut écrire qu'à l'adresse du
 *   compte Resend — il ne convient donc pas ici et la garde le refusera.
 */
function expediteur(): string | null {
  const brut =
    process.env.DEMO_FROM_EMAIL?.trim() ||
    process.env.VEILLE_FROM_EMAIL?.trim() ||
    `contact@${DOMAINE_EXPEDITEUR}`;

  const adresse = brut.toLowerCase();
  if (!adresse.endsWith(`@${DOMAINE_EXPEDITEUR}`)) {
    return null;
  }
  return brut;
}

/** Destinataire de la notification interne. */
function destinataireInterne(): string {
  return (
    process.env.DEMO_NOTIFICATION_EMAIL?.trim() ||
    process.env.VEILLE_DESTINATAIRE?.trim() ||
    EMAIL_CONTACT
  );
}

/**
 * Corps de la notification interne : une information par ligne, en texte
 * simple. Pas de HTML — il se lit aussi bien sur un téléphone que dans un
 * client texte, et rien n'y est mis en forme qui doive l'être.
 */
export function corpsNotification(d: DemandeDemo): string {
  const lignes = [
    `Entreprise      : ${d.entreprise}`,
    `Effectif        : ${d.effectif}`,
    `Contact         : ${d.prenom} ${d.nom}`,
    `Email           : ${d.email}`,
    `Téléphone       : ${d.telephone}`,
    `Microsoft 365   : ${d.microsoft365}`,
  ];

  if (d.besoin) {
    lignes.push("", "Besoin exprimé :", d.besoin);
  }

  lignes.push(
    "",
    "— Répondre à ce message écrit directement au demandeur.",
  );

  return lignes.join("\n");
}

/** Confirmation envoyée au demandeur. Courte, sobre, sans mise en forme. */
export function corpsConfirmation(d: DemandeDemo): string {
  return [
    `Bonjour ${d.prenom},`,
    "",
    "Nous avons bien reçu votre demande de démonstration de Safentreprise.",
    "Nous revenons vers vous sous 24 heures ouvrées pour convenir d'un créneau.",
    "",
    "Si vous préférez nous joindre entre-temps :",
    `  Téléphone : ${TELEPHONE_AFFICHE}`,
    `  Email     : ${EMAIL_CONTACT}`,
    "",
    "L'équipe Safentreprise",
  ].join("\n");
}

export type ResultatNotification = {
  interne: ResultatEnvoiEmail;
  confirmation: ResultatEnvoiEmail;
};

/**
 * Envoie les deux emails. Les échecs sont rendus, jamais levés.
 *
 * ⚠ LES DEUX ENVOIS SONT INDÉPENDANTS. Un `Promise.all` ferait échouer les
 *   deux si l'un rejetait ; `envoyerEmail` ne rejette pas, mais on garde des
 *   envois séquentiels pour que l'échec de l'un ne masque pas le sort de
 *   l'autre dans les logs.
 */
export async function notifierDemande(
  d: DemandeDemo,
): Promise<ResultatNotification> {
  const from = expediteur();

  if (!from) {
    const erreur =
      `Aucune adresse d'expédition sur @${DOMAINE_EXPEDITEUR} : poser ` +
      `DEMO_FROM_EMAIL (ou VEILLE_FROM_EMAIL) sur une adresse du domaine, ` +
      `vérifiée chez Resend.`;
    return {
      interne: { ok: false, erreur },
      confirmation: { ok: false, erreur },
    };
  }

  const interne = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: destinataireInterne(),
    subject: `Nouvelle demande de démo — ${d.entreprise}`,
    text: corpsNotification(d),
    // Répondre à la notification écrit au demandeur, pas à la boîte technique.
    replyTo: d.email,
  });

  const confirmation = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: d.email,
    subject: "Votre demande de démonstration Safentreprise",
    text: corpsConfirmation(d),
    replyTo: EMAIL_CONTACT,
  });

  return { interne, confirmation };
}
