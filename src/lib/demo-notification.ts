/**
 * Les deux emails déclenchés par une demande de démonstration.
 *
 * ⚠ AUCUNE DE CES FONCTIONS NE LÈVE. Une demande enregistrée est acquise ;
 *   l'email n'en est que l'écho. Un échec Resend est consigné et rendu, jamais
 *   propagé — voir l'ordre imposé dans /api/demo : enregistrer, puis notifier.
 *
 * ⚠ LA CONFIRMATION AUTOMATIQUE EST SUSPENDUE DEPUIS LE 16 SEPTEMBRE 2026.
 *   NE PAS LA RÉTABLIR SANS LE FILTRE ANTI-ROBOT.
 *
 *   Un robot a soumis le formulaire cinq fois avec des adresses réelles volées
 *   à des tiers (waldner.de, trekronormedia.se, …). Chaque soumission
 *   déclenchait un vrai message, depuis notre domaine, vers quelqu'un qui
 *   n'avait rien demandé : c'est la définition du spam, et c'est ce qui fait
 *   signaler un domaine chez Resend. La notification interne, elle, part vers
 *   notre propre boîte et ne pose aucun problème.
 *
 *   Écrire à une adresse que PERSONNE N'A VÉRIFIÉE est le défaut de conception ;
 *   le volume n'en était que le révélateur. La confirmation ne reviendra donc
 *   pas « quand le robot sera parti », mais quand une demande aura franchi le
 *   piège à robots, la limitation de débit et la validation de saisie — et
 *   seulement pour celles-là.
 *
 *   `corpsConfirmation` est conservée telle quelle : c'est le texte qui
 *   reviendra, pas du code mort à supprimer.
 *
 * ⚠ L'EXPÉDITEUR NE PEUT PAS ÊTRE UNE ADRESSE GRAND PUBLIC. Resend refuse
 *   d'expédier depuis un domaine non vérifié, et un envoi « de » gmail.com
 *   serait de toute façon rejeté par la plupart des serveurs destinataires au
 *   titre de DMARC. La garde ci-dessous refuse l'envoi plutôt que de laisser
 *   partir un message qui finirait en indésirable.
 */
import { envoyerEmail, type ResultatEnvoiEmail } from "@/lib/send/email";
import { erreurExpediteur, expediteurVerifie } from "@/lib/send/expediteur";
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

/**
 * Variables consultées, dans l'ordre, pour l'adresse d'expédition.
 * La garde elle-même vit dans `@/lib/send/expediteur`, partagée avec l'alerte
 * au dirigeant.
 */
const VARIABLES_EXPEDITEUR = ["DEMO_FROM_EMAIL", "VEILLE_FROM_EMAIL"];

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
  /**
   * `null` = aucune confirmation n'a été TENTÉE, volontairement.
   *
   * ⚠ CE N'EST PAS UN ÉCHEC, ET L'APPELANT NE DOIT PAS LE JOURNALISER COMME
   *   TEL. Un `{ ok: false }` dit « Resend a refusé » et appelle un diagnostic ;
   *   `null` dit « on a choisi de ne pas écrire ». Les confondre ferait
   *   chercher une panne là où il y a une décision.
   */
  confirmation: ResultatEnvoiEmail | null;
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
  const from = expediteurVerifie(VARIABLES_EXPEDITEUR);

  if (!from) {
    const erreur = erreurExpediteur(VARIABLES_EXPEDITEUR);
    return { interne: { ok: false, erreur }, confirmation: null };
  }

  const interne = await envoyerEmail({
    from: `Safentreprise <${from}>`,
    to: destinataireInterne(),
    subject: `Nouvelle demande de démo — ${d.entreprise}`,
    text: corpsNotification(d),
    // Répondre à la notification écrit au demandeur, pas à la boîte technique.
    replyTo: d.email,
  });

  // ⚠ RIEN NE PART VERS `d.email`. C'est la seule ligne de ce fichier qui
  //   écrivait à une adresse fournie par un inconnu ; voir l'en-tête.
  return { interne, confirmation: null };
}
