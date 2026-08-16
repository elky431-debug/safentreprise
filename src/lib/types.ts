/**
 * Types TypeScript alignés sur le schéma Supabase de Safentreprise.
 */

export type ModeResultats = "nominatif" | "anonymise";

export type Company = {
  id: string;
  nom: string;
  secteur: string | null;
  /** Personne qui pilote les campagnes depuis Safentreprise */
  nom_responsable: string;
  email_responsable: string;
  telephone_responsable: string | null;
  /** Identité que les fraudeurs usurperaient dans un vrai scénario */
  nom_dirigeant: string;
  user_id: string;
  mode_resultats: ModeResultats;
  employes_informes: boolean;
  /** Secret d'activation de l'extension Safentreprise Guard (ex. SAFE-A3X9K2). */
  code_activation: string;
  created_at: string;
};

/**
 * Auto-évaluation du risque remplie à l'onboarding.
 * Les scores sont des pourcentages de RISQUE (100 = exposition maximale).
 */
export type RiskAssessment = {
  id: string;
  company_id: string;
  reponses: Record<string, unknown>;
  score_procedures: number;
  score_humain: number;
  score_technique: number;
  score_global: number;
  created_at: string;
};

/** Point d'historique du score dynamique (courbe dashboard). */
export type ScoreHistory = {
  id: string;
  company_id: string;
  score_global: number;
  score_humain: number;
  created_at: string;
};

export type Employee = {
  id: string;
  company_id: string;
  prenom: string;
  email: string;
  telephone: string | null;
  created_at: string;
};

/** Charte visuelle de la société (logo, couleur, signature). */
export type Branding = {
  id: string;
  company_id: string;
  logo_url: string | null;
  couleur_principale: string;
  signature_html: string | null;
  updated_at: string;
  created_at: string;
};

/** Faux fournisseur réutilisable pour les scénarios « fournisseur ». */
export type Supplier = {
  id: string;
  company_id: string;
  nom: string;
  email_type: string | null;
  logo_url: string | null;
  created_at: string;
};

/**
 * Gabarit HTML/SMS.
 * `company_id` à null = gabarit SYSTÈME fourni par l'opérateur : visible par
 * toutes les sociétés, modifiable par aucune. Sinon, gabarit propre au client,
 * qui a la priorité sur le gabarit système de même type et canal.
 */
export type MessageTemplate = {
  id: string;
  company_id: string | null;
  type_fraude: TypeFraude;
  canal: CanalMessage;
  objet: string | null;
  contenu_html: string;
  actif: boolean;
  created_at: string;
};

/**
 * Question du quiz post-simulation.
 * `company_id` à null = question SYSTÈME. Les questions d'une société
 * s'ajoutent aux questions système, elles ne les remplacent pas.
 */
export type QuizQuestion = {
  id: string;
  company_id: string | null;
  type_fraude: TypeFraude | null;
  question: string;
  options: string[];
  bonne_reponse: number;
  ordre: number;
  actif: boolean;
  created_at: string;
};

/** Type de fraude d'un message : toujours l'un ou l'autre, jamais les deux. */
export type TypeFraude = "president" | "fournisseur";

/** Canal d'un message : concret, contrairement au canal d'une campagne. */
export type CanalMessage = "email" | "sms";

/** Une campagne peut encore porter « les_deux » (données legacy). */
export type TypeFraudeCampagne = TypeFraude | "les_deux";
export type CanalCampagne = CanalMessage | "les_deux";

export type StatutCampagne = "brouillon" | "prete" | "envoyee";

export type Campaign = {
  id: string;
  company_id: string;
  nom: string;
  type_fraude: TypeFraudeCampagne;
  canal: CanalCampagne;
  statut: StatutCampagne;
  supplier_id: string | null;
  date_lancement: string | null;
  date_planifiee: string | null;
  recurrence: string | null;
  created_at: string;
};

/** @deprecated Variantes IA — conservé pour compatibilité schéma. */
export type CampaignMessage = {
  id: string;
  campaign_id: string;
  type_fraude: TypeFraude;
  canal: CanalMessage;
  objet: string | null;
  contenu: string;
  ordre: number;
  created_at: string;
};

export type CampaignTarget = {
  id: string;
  campaign_id: string;
  employee_id: string;
  message_id: string | null;
  template_id: string | null;
  message_final_html: string | null;
  objet_final: string | null;
  token_unique: string | null;
  message_envoye: boolean;
  envoye_at: string | null;
  a_clique: boolean;
  a_signale: boolean;
  a_relance: boolean;
  quiz_complete: boolean;
  score_quiz: number | null;
  created_at: string;
};

export type Payment = {
  id: string;
  company_id: string;
  campaign_id: string | null;
  montant: number;
  statut_stripe: string;
  created_at: string;
};

export type Certificate = {
  id: string;
  company_id: string;
  campaign_id: string;
  date_emission: string;
  url_pdf: string | null;
  created_at: string;
};

/* --------------------------------------------------------------------------
   Extension Safentreprise Guard
   -------------------------------------------------------------------------- */

/** Gravité d'une tentative détectée par l'extension. */
export type NiveauRisqueMenace = "faible" | "modere" | "eleve";

/**
 * Tentative d'usurpation remontée par l'extension.
 * MÉTADONNÉES UNIQUEMENT : aucun contenu d'email n'est transmis ni stocké.
 */
export type MenaceDetectee = {
  id: string;
  company_id: string;
  /** Nom affiché par l'expéditeur du message */
  expediteur_nom: string | null;
  expediteur_email: string;
  /** Nom signé en bas du message — celui du dirigeant usurpé */
  nom_signe: string | null;
  objet: string | null;
  niveau_risque: NiveauRisqueMenace;
  score: number;
  /** Libellés des signaux relevés par l'extension */
  signaux: string[];
  /** Destinataire de l'alerte ; nul en mode anonymisé */
  employe_email: string | null;
  detecte_at: string;
  created_at: string;
};

/**
 * Activation de l'extension par un collaborateur.
 * Une ligne par adresse ayant saisi le code de la société.
 */
export type ActivationExtension = {
  id: string;
  company_id: string;
  employe_email: string;
  activated_at: string;
  last_seen_at: string;
};
