/**
 * Coordonnées de contact publiques — source unique.
 *
 * ⚠ LE NUMÉRO EXISTE SOUS DEUX FORMES, ET ELLES NE SONT PAS INTERCHANGEABLES.
 *   Celle qui s'affiche est groupée par paires, à la française ; celle du lien
 *   `tel:` est au format international, sans espace ni zéro initial. Un lien
 *   `tel:` contenant des espaces n'est pas composé par tous les téléphones, et
 *   un numéro en 06 n'est pas joignable depuis l'étranger.
 *
 * ⚠ MODULE SANS REACT, ET IL DOIT LE RESTER. Il est lu par la vitrine comme
 *   par les emails envoyés côté serveur : y importer un composant obligerait
 *   la route d'API à charger React pour trois chaînes de caractères.
 */
export const TELEPHONE_AFFICHE = "06 37 11 40 68";
export const TELEPHONE_LIEN = "+33637114068";
export const EMAIL_CONTACT = "contact@safentreprise.com";
