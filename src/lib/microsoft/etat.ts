/**
 * Ce qu'est un raccordement Microsoft 365, et ce qu'on en dit à l'écran.
 *
 * ⚠ CE FICHIER NE DOIT RIEN IMPORTER. Il est chargé aussi bien par les
 *   composants serveur que par ceux qui tournent dans le navigateur. La lecture
 *   en base vit à côté, dans parcours.ts, qui dépend du client Supabase serveur
 *   et ne peut donc pas être importé depuis un composant client — une seule
 *   ligne d'import de trop y faisait échouer la compilation du bundle.
 */

export type EtapeRaccordement =
  /** Rien : Microsoft n'a jamais donné son accord, ou il a été retiré. */
  | "non-raccorde"
  /** L'accord existe ; reste à choisir les boîtes. */
  | "boites"
  /** Les boîtes sont choisies ; la restriction n'est pas encore constatée. */
  | "restriction"
  /** La restriction est constatée ; la surveillance n'est pas encore lancée. */
  | "activation"
  /** Des boîtes sont abonnées : les messages sont analysés. */
  | "actif";

export type BoiteEtat = {
  id: string;
  graph_user_id: string;
  upn: string;
  /**
   * Ce que le client VEUT surveiller.
   *
   * ⚠ À NE PAS CONFONDRE AVEC `actif`. Une boîte retirée garde sa ligne — son
   *   abonnement Graph y pend, et il survit quelques jours — mais elle n'est
   *   plus surveillée, ses notifications sont refusées à l'entrée, et son
   *   adresse ne figure plus dans le périmètre de restriction.
   */
  choisie: boolean;
  /** Ce que la vérification de restriction a AUTORISÉ. */
  actif: boolean;
  /** Preuve de restriction pour CETTE boîte — pas déduite du reste. */
  restriction_verifiee_at: string | null;
  /** Abonnée chez Microsoft : c'est ce qui fait réellement arriver les mails. */
  abonnee: boolean;
  abonnement_expire_at: string | null;
};

export type Raccordement = {
  etape: EtapeRaccordement;
  tenant_uid: string | null;
  /** Le GUID du locataire Entra, tel que Microsoft nous l'a donné. */
  tenant_id: string | null;
  statut: "actif" | "revoque" | "erreur" | null;
  consenti_par: string | null;
  consenti_at: string | null;
  restriction_verifiee_at: string | null;
  /** La réponse exacte de Microsoft qui a servi de preuve. */
  restriction_preuve: string | null;
  temoin_upn: string | null;
  temoin_origine: string | null;
  derniere_erreur: string | null;
  boites: BoiteEtat[];
};

/**
 * Une boîte est-elle RÉELLEMENT surveillée ?
 *
 * Les trois conditions ne disent pas la même chose, et il faut les trois :
 *   `choisie` — le client la veut ;
 *   `actif`   — la vérification de restriction l'a autorisée ;
 *   `abonnee` — Microsoft nous envoie effectivement ses messages.
 *
 * ⚠ `actif` N'EST PAS REDONDANT AVEC `abonnee`. Un abonnement Graph survit
 *   quelques jours à la mise hors service d'une boîte, et TOUTES les fonctions
 *   d'ingestion exigent `b.actif` (20260826, 20260829, 20260903, 20260904…).
 *   Une boîte abonnée mais inactive reçoit donc des notifications qui sont
 *   refusées à l'entrée : rien n'est analysé, elle ne compte pas.
 *
 * ⚠ UNE SEULE DÉFINITION POUR TOUT LE PRODUIT. Le compteur de /microsoft et la
 *   couverture qui allège l'axe technique du score doivent donner le même
 *   nombre ; deux prédicats séparés finiraient par diverger, et le client
 *   verrait « 3 boîtes surveillées » d'un côté et 2 de l'autre.
 */
export function estSurveillee(
  b: Pick<BoiteEtat, "choisie" | "actif" | "abonnee">,
): boolean {
  return b.choisie && b.actif && b.abonnee;
}

/**
 * L'étape courante, déduite de ce qui existe réellement.
 *
 * ⚠ CHAQUE CONDITION PORTE UNE PROMESSE. Une boîte cochée n'est pas surveillée,
 *   une restriction non constatée ne protège rien, et un abonnement absent veut
 *   dire que Microsoft ne nous parle jamais de cette boîte. Assouplir l'une de
 *   ces lignes ferait afficher « actif » à un client qui ne l'est pas.
 */
export function deduireEtape(
  tenant: Pick<Raccordement, "statut" | "restriction_verifiee_at">,
  toutes: Pick<BoiteEtat, "choisie" | "abonnee">[],
): EtapeRaccordement {
  // Une boîte retirée ne compte pour rien ici : elle n'est plus surveillée, et
  // son abonnement résiduel ne doit surtout pas faire dire « actif ».
  const boites = toutes.filter((b) => b.choisie);

  // Un accord retiré ramène au départ : il faut le redonner, rien d'autre ne
  // débloquera la suite.
  if (tenant.statut === "revoque") return "non-raccorde";
  if (boites.length === 0) return "boites";
  if (!tenant.restriction_verifiee_at) return "restriction";
  if (!boites.some((b) => b.abonnee)) return "activation";
  return "actif";
}

/* --------------------------------------------------------------------------
   Ce qu'on en dit à l'écran
   -------------------------------------------------------------------------- */

/** Les quatre étapes visibles, dans l'ordre. Le consentement est l'entrée. */
export const ETAPES_VISIBLES: {
  cle: EtapeRaccordement;
  numero: number;
  titre: string;
}[] = [
  { cle: "non-raccorde", numero: 1, titre: "Autoriser" },
  { cle: "boites", numero: 2, titre: "Choisir les boîtes" },
  { cle: "restriction", numero: 3, titre: "Restreindre l'accès" },
  { cle: "activation", numero: 4, titre: "Démarrer" },
];

/**
 * Une phrase, pour le bandeau du tableau de bord.
 *
 * ⚠ ELLE NE DOIT JAMAIS RASSURER À TORT. Tant que les messages ne sont pas
 *   analysés, elle le dit — un client qui se croit protégé sans l'être est le
 *   pire état possible pour un produit de sécurité.
 */
export function resumeRaccordement(r: Raccordement): string {
  if (r.statut === "revoque") {
    return "L'autorisation Microsoft a été retirée : plus aucun message n'est analysé.";
  }
  if (r.statut === "erreur") {
    return "Le raccordement Microsoft 365 est en erreur : les messages ne sont plus analysés de façon fiable.";
  }

  switch (r.etape) {
    case "non-raccorde":
      return "Vos boîtes Microsoft 365 ne sont pas surveillées. Le raccordement prend une dizaine de minutes.";
    case "boites":
      return "Raccordement commencé. Il reste à choisir les boîtes à surveiller — aucun message n'est analysé pour l'instant.";
    case "restriction":
      return "Il reste à restreindre l'accès de Safentreprise à vos seules boîtes choisies. Tant que ce n'est pas vérifié, aucun message n'est analysé.";
    case "activation":
      return "La restriction est vérifiée. Il reste à démarrer la surveillance — aucun message n'est analysé pour l'instant.";
    case "actif": {
      const n = r.boites.filter(estSurveillee).length;
      return n === 1 ? "1 boîte surveillée." : `${n} boîtes surveillées.`;
    }
  }
}
