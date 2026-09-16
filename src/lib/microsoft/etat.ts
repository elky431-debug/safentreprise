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
  /** Depuis quand le statut courant dure — écrit par la vérification de santé. */
  sante_bascule_at: string | null;
  /** Dernière vérification de santé, succès ou échec. */
  sante_verifiee_at: string | null;
  /** Refus d'autorisation consécutifs. Trois font basculer en « revoque ». */
  echecs_sante: number;
  /**
   * Laquelle des deux portes a lâché : « courrier » (RBAC Exchange) ou
   * « tout » (jeton refusé). `null` quand la surveillance tourne.
   *
   * ⚠ L'ANNUAIRE N'EST PAS UNE PORTÉE, IL A SON PROPRE AXE. Il ne coupe pas la
   *   surveillance — il la dégrade — et le confondre avec les deux autres
   *   ferait afficher « arrêtée » à un client dont les messages sont analysés.
   */
  panne_portee: "courrier" | "tout" | null;
  /** Annuaire Entra inaccessible depuis cette date. N'arrête rien. */
  annuaire_ko_at: string | null;
  annuaire_erreur: string | null;
  boites: BoiteEtat[];
};

/**
 * La surveillance est-elle ARRÊTÉE, quel que soit l'état du parcours ?
 *
 * ⚠ CE PRÉDICAT DOMINE TOUT LE RESTE DE L'AFFICHAGE. Un locataire peut avoir
 *   ses quatre étapes franchies, ses boîtes vérifiées et ses abonnements
 *   vivants, et n'analyser plus rien : il suffit que l'autorisation Microsoft
 *   ait été retirée. Tant que ce prédicat est vrai, aucun écran n'a le droit
 *   d'annoncer « n boîtes surveillées ».
 *
 * ⚠ IL EXISTE PARCE QUE `deduireEtape` NE SUFFIT PAS. Elle ne connaît que
 *   « revoque », et rend alors « non-raccorde » — ce qui fait dire à
 *   l'interface « reprendre le raccordement » là où il faut dire « votre
 *   surveillance est arrêtée ». Et sur « erreur » elle ne voit rien du tout :
 *   l'écran affichait le cadre vert « la surveillance est en place » sur un
 *   client dont on ne savait plus si elle fonctionnait.
 */
export function surveillanceInterrompue(
  r: Pick<Raccordement, "statut">,
): boolean {
  return r.statut === "revoque" || r.statut === "erreur";
}

/**
 * La surveillance tourne, mais amputée : l'annuaire ne répond plus.
 *
 * ⚠ CE N'EST PAS UNE INTERRUPTION, ET LES DEUX NE DOIVENT JAMAIS ÊTRE
 *   CONFONDUES. Les messages continuent d'être analysés et les bannières de se
 *   poser ; ce qui tombe, c'est la reconnaissance des dirigeants et des
 *   collaborateurs — donc l'usurpation d'annuaire, la règle la plus forte du
 *   moteur. Grave, urgent, mais pas « arrêté ».
 *
 * ⚠ ET SURTOUT : CET ÉTAT NE TOUCHE PAS À `statut`. Quarante requêtes exigent
 *   `statut = 'actif'`, dont le renouvellement des abonnements Graph. Marquer
 *   un locataire en panne pour un problème d'annuaire ferait expirer ses
 *   abonnements en moins de sept jours et tuerait la surveillance du courrier,
 *   qui fonctionnait. Voir `20261008_portee_panne.sql`.
 */
export function annuaireCoupe(
  r: Pick<Raccordement, "annuaire_ko_at" | "statut">,
): boolean {
  // Sur une surveillance déjà interrompue, le rouge dit tout : l'ambre ferait
  // doublon et diluerait le message qui compte.
  if (surveillanceInterrompue(r)) return false;
  return r.annuaire_ko_at !== null;
}

/**
 * Le nombre de boîtes RÉELLEMENT surveillées, santé du locataire comprise.
 *
 * ⚠ ZÉRO QUAND LE RACCORDEMENT EST COUPÉ, ET CE N'EST PAS UN DÉTAIL
 *   D'AFFICHAGE. Ce compte alimente la couverture qui allège l'axe technique
 *   du taux d'exposition. Sans cette remise à zéro, un client dont
 *   l'autorisation vient d'être retirée garderait les points gagnés grâce à
 *   une surveillance qui ne tourne plus — le score dirait « −32 points grâce à
 *   la surveillance de vos boîtes » à quelqu'un qui n'est plus surveillé.
 *   C'est le même mensonge que celui que cette vérification corrige.
 */
export function nombreBoitesSurveillees(r: Raccordement): number {
  if (surveillanceInterrompue(r)) return 0;
  return r.boites.filter(estSurveillee).length;
}

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
  tenant: Pick<Raccordement, "statut" | "restriction_verifiee_at" | "panne_portee">,
  toutes: Pick<BoiteEtat, "choisie" | "abonnee">[],
): EtapeRaccordement {
  // Une boîte retirée ne compte pour rien ici : elle n'est plus surveillée, et
  // son abonnement résiduel ne doit surtout pas faire dire « actif ».
  const boites = toutes.filter((b) => b.choisie);

  // ⚠ UNE PANNE DE COURRIER NE RAMÈNE PAS À L'ÉTAPE 1, ET C'EST LA CORRECTION
  //   D'UN DÉFAUT GRAVE DU 16 SEPTEMBRE 2026. Le parcours retombait à
  //   « Autoriser » dès que `statut = revoque`, sans regarder QUELLE PORTE
  //   avait lâché. Or `panne_portee = 'courrier'` veut dire que l'accord Entra
  //   est intact et que c'est le rôle Exchange qui manque : l'écran envoyait
  //   donc le client redonner un consentement qui n'avait jamais été retiré.
  //
  //   Le geste était non seulement inutile, il ÉTEIGNAIT L'ALERTE — voir la
  //   correction jumelle dans `valider_consentement_graph`. L'interface
  //   invitait donc elle-même au geste qui la faisait mentir.
  //
  //   La bonne étape est la 3 : c'est le script de restriction qui repose le
  //   rôle Exchange.
  if (tenant.statut === "revoque" && tenant.panne_portee === "courrier") {
    return "restriction";
  }

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
  // ⚠ LES DEUX PANNES NE DISENT PAS LA MÊME CHOSE, ET LE CLIENT NE DOIT PAS
  //   AGIR PAREIL. « revoque » est un fait constaté trois fois : l'accord est
  //   parti, lui seul peut le redonner. « erreur » est un doute : nous
  //   revérifions toutes les demi-heures, il n'a rien à faire. Les écrire du
  //   même ton enverrait un client refaire un parcours pour une panne de cinq
  //   minutes, ou en laisserait un autre attendre un rétablissement qui ne
  //   viendra jamais.
  if (r.statut === "revoque") {
    // ⚠ DEUX COUPURES, DEUX REMÈDES OPPOSÉS. « courrier » se répare en
    //   réexécutant le script PowerShell ; « tout » demande de reprendre le
    //   consentement PUIS le script. Dire l'un pour l'autre fait tourner en
    //   rond un client dont plus rien n'est analysé.
    if (r.panne_portee === "tout") {
      return (
        "Microsoft refuse toute autorisation" +
        depuisQuand(r.sante_bascule_at) +
        " : plus aucun message n'est analysé. L'application Safentreprise a " +
        "probablement été supprimée de votre annuaire."
      );
    }
    return (
      "L'accès à vos boîtes a été retiré dans Exchange" +
      depuisQuand(r.sante_bascule_at) +
      " : plus aucun message n'est analysé. C'est le script PowerShell qu'il " +
      "faut faire réexécuter, pas le consentement."
    );
  }

  if (annuaireCoupe(r)) {
    return (
      "Vos messages sont toujours analysés, mais l'annuaire Microsoft ne " +
      "répond plus" +
      depuisQuand(r.annuaire_ko_at) +
      " : l'usurpation de vos dirigeants n'est plus détectée."
    );
  }
  if (r.statut === "erreur") {
    return (
      "Nous ne parvenons plus à joindre votre messagerie Microsoft 365" +
      depuisQuand(r.sante_bascule_at) +
      " : la surveillance n'est plus fiable. Nous revérifions automatiquement " +
      "toutes les trente minutes."
    );
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
      const n = nombreBoitesSurveillees(r);
      return n === 1 ? "1 boîte surveillée." : `${n} boîtes surveillées.`;
    }
  }
}

/**
 * « depuis le 14 septembre 2026 à 09:12 », ou rien si la date manque.
 *
 * ⚠ ELLE PEUT MANQUER, ET LA PHRASE DOIT TENIR SANS ELLE. Un locataire passé
 *   en panne avant la migration `20261006` n'a pas de date de bascule. Écrire
 *   « depuis null » serait pire que de ne rien dire.
 */
function depuisQuand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ` depuis le ${new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)}`;
}
