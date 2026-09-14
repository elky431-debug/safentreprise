/**
 * Grille tarifaire — source unique des montants, pour /tarifs ET /diagnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ LES MONTANTS SONT PUBLICS DEPUIS LE 14 SEPTEMBRE 2026, SUR LES DEUX PAGES.
 *
 *   La promesse d'origine — « aucun montant n'est envoyé au navigateur tant
 *   que le drapeau vaut false » — n'a plus cours : les chiffres partent dans
 *   le bundle, /tarifs et /diagnostic les affichent tous les deux.
 *
 * ⚠ REPASSER LE DRAPEAU À `false` NE SUFFIRAIT PLUS À LES CACHER. /diagnostic
 *   ne le consulte pas : il affiche le prix correspondant à l'effectif déclaré
 *   parce que c'est ce qui donne sa conclusion au parcours. Vouloir revenir à
 *   « Sur devis » demande donc de traiter les DEUX pages — sinon on recrée la
 *   contradiction que ce passage à `true` vient de supprimer.
 *
 * ⚠ LE VOCABULAIRE DE /tarifs SUIT LES MONTANTS. Les boutons disaient
 *   « Demander un devis » et le bas de page promettait « une proposition
 *   chiffrée » : sous des prix affichés, les deux racontaient que le chiffre
 *   était caché. Ils disent maintenant « Demander une démo », ce qui est aussi
 *   la destination réelle du lien (/demo). Toute remise à `false` doit repasser
 *   par là.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Interrupteur de la page /tarifs uniquement. `false` = « Sur devis ». */
export const AFFICHER_LES_PRIX = true;

/** Montants d'une offre, en euros hors taxes. */
export type PrixOffre = {
  /** Facturé une fois, au démarrage. */
  auditInitial: number;
  /** Abonnement, par mois. */
  abonnementMensuel: number;
};

export type Offre = {
  cle: "essentiel" | "business" | "entreprise";
  nom: string;
  /** Effectif cible, tel qu'affiché sur la carte. */
  effectif: string;
  /** Une phrase : à qui l'offre s'adresse. */
  argument: string;
  /** `null` tant que la grille n'est pas publiée. */
  prix: PrixOffre | null;
  /** Carte mise en avant visuellement (une seule). */
  miseEnAvant: boolean;
};

export const OFFRES: Offre[] = [
  {
    cle: "essentiel",
    nom: "Essentiel",
    effectif: "Jusqu’à 25 collaborateurs",
    argument:
      "Pour une structure où la validation des paiements repose sur une ou deux personnes.",
    prix: { auditInitial: 290, abonnementMensuel: 59 },
    miseEnAvant: false,
  },
  {
    cle: "business",
    nom: "Business",
    effectif: "De 26 à 75 collaborateurs",
    argument:
      "Pour une PME dotée d’un service comptable et de circuits de validation formalisés.",
    prix: { auditInitial: 490, abonnementMensuel: 149 },
    miseEnAvant: true,
  },
  {
    cle: "entreprise",
    nom: "Entreprise",
    effectif: "De 76 à 200 collaborateurs",
    argument:
      "Pour une organisation multi-sites, avec plusieurs équipes exposées aux demandes de virement.",
    prix: { auditInitial: 890, abonnementMensuel: 299 },
    miseEnAvant: false,
  },
];

/** Élément de liste : intitulé en gras, puis précision. */
export type Prestation = { titre: string; precision?: string };

/** Contenu de l'audit initial — identique quelle que soit l'offre. */
export const AUDIT_INITIAL: Prestation[] = [
  {
    titre: "Cartographie de l’exposition",
    precision: "sur les 9 axes d’évaluation (procédures, humain, technique)",
  },
  {
    titre: "Campagne de simulation initiale",
    precision: "servant de mesure de référence",
  },
  {
    titre: "Rapport de diagnostic",
    precision:
      "score global, points de vulnérabilité, comparaison sectorielle",
  },
  { titre: "Plan de réduction du risque", precision: "sur 12 mois" },
  {
    titre: "Kit de conformité",
    precision:
      "modèle d’information des collaborateurs, trame de consultation CSE, mention pour le registre des traitements",
  },
  { titre: "Import et validation", precision: "de la base collaborateurs" },
  { titre: "Paramétrage", precision: "des scénarios adaptés au secteur" },
  { titre: "Raccordement", precision: "de vos boîtes Microsoft 365" },
  { titre: "Restitution en visioconférence", precision: "1 h, avec le dirigeant" },
];

/** Contenu de l'abonnement — identique quelle que soit l'offre. */
export const ABONNEMENT: Prestation[] = [
  {
    titre: "Surveillance des boîtes Microsoft 365",
    precision:
      "détection des tentatives d’usurpation, active en continu, sans rien à installer",
  },
  {
    titre: "Campagnes de simulation récurrentes",
    precision: "fraude au président, faux fournisseur, changement de RIB",
  },
  {
    titre: "Formation interactive",
    precision: "déclenchée automatiquement après chaque interaction",
  },
  {
    titre: "Score de risque dynamique",
    precision: "par collaborateur et global",
  },
  { titre: "Tableau de bord", precision: "et rapports d’évolution" },
  { titre: "Attestations de sensibilisation", precision: "individuelles" },
  { titre: "Support par e-mail" },
];

/** Conditions commerciales communes aux trois offres. */
export const CONDITIONS: Prestation[] = [
  {
    titre: "Facturation",
    precision:
      "audit payable à la commande, abonnement facturé annuellement d’avance",
  },
  {
    titre: "Engagement",
    precision: "12 mois, reconduction tacite, préavis de 2 mois",
  },
  {
    titre: "Paiement mensuel de l’abonnement",
    precision: "possible, avec une majoration de 15 %",
  },
  {
    titre: "Changement de palier",
    precision:
      "l’ajustement prend effet à la date anniversaire, jamais en cours d’année",
  },
];

/** Format monétaire français, sans décimales : 1 234 €. */
export function formaterEuros(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(montant);
}
