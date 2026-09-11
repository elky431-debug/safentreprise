/**
 * L'adresse d'expédition, et la garde qui la protège.
 *
 * ⚠ UN SEUL DOMAINE PEUT EXPÉDIER, ET LA GARDE REFUSE PLUTÔT QUE DE CORRIGER.
 *   Resend n'expédie que depuis un domaine vérifié ; et un message « de »
 *   gmail.com serait de toute façon rejeté par la plupart des serveurs
 *   destinataires au titre de DMARC. Laisser partir un tel message le ferait
 *   atterrir en indésirable — c'est-à-dire nulle part, sans que personne ne
 *   s'en aperçoive. Un refus explicite, lui, se voit.
 *
 * ⚠ CE MODULE EST PARTAGÉ PAR TOUS LES ENVOIS, et il doit le rester. La garde
 *   a d'abord été écrite pour le formulaire de démonstration ; l'alerte au
 *   dirigeant en avait besoin à l'identique. La recopier aurait créé deux
 *   règles destinées à diverger.
 */

/** Domaine seul autorisé à expédier. */
export const DOMAINE_EXPEDITEUR = "safentreprise.com";

/**
 * Première variable d'environnement renseignée, à condition qu'elle porte une
 * adresse du domaine. `null` si aucune ne convient — l'appelant décide alors
 * quoi faire, et aucune ne doit envoyer quand même.
 *
 * ⚠ EN DÉVELOPPEMENT, `onboarding@resend.dev` NE CONVIENT PAS. Resend
 *   l'accepte, mais il ne peut écrire qu'à l'adresse du compte Resend : un
 *   essai réussi ne prouverait rien sur un envoi réel. La garde le refuse.
 */
export function expediteurVerifie(
  variables: string[],
  defaut = `contact@${DOMAINE_EXPEDITEUR}`,
): string | null {
  const brut =
    variables.map((v) => process.env[v]?.trim()).find((v) => v) || defaut;

  if (!brut.toLowerCase().endsWith(`@${DOMAINE_EXPEDITEUR}`)) {
    return null;
  }
  return brut;
}

/** Le message à consigner quand la garde a refusé. */
export function erreurExpediteur(variables: string[]): string {
  return (
    `Aucune adresse d'expédition sur @${DOMAINE_EXPEDITEUR} : poser ` +
    `${variables.join(" ou ")} sur une adresse du domaine, vérifiée chez Resend.`
  );
}
