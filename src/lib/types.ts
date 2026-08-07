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

/** Gabarit HTML/SMS rédigé par l'opérateur Safentreprise. */
export type MessageTemplate = {
  id: string;
  type_fraude: TypeFraude;
  canal: CanalMessage;
  objet: string | null;
  contenu_html: string;
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
