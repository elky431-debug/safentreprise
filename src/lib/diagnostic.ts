/**
 * Le diagnostic d'exposition à la fraude au virement.
 *
 * Ce fichier porte TOUT ce qui décide : les questions, leur pondération, les
 * paliers, et le texte associé à chaque réponse. Les composants ne font que
 * l'afficher. Un barème éparpillé entre un composant et une route serait
 * impossible à relire — et c'est un barème qu'un prospect peut contester.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ LE SCORE DOIT POUVOIR DESCENDRE, SINON L'OUTIL NE VAUT RIEN.
 *
 *   Un questionnaire commercial qui rend toujours « exposition élevée » est
 *   repéré au deuxième essai : il suffit de tout répondre au mieux pour voir
 *   que rien ne bouge. L'outil perd alors sa crédibilité, et il emporte avec
 *   lui celle du reste de la page.
 *
 *   D'où l'écart réel : le profil le plus vertueux tombe à 35 (plancher), le
 *   plus négligent monte à 95 (plafond). Le test `diagnostic.test.ts` vérifie
 *   cet écart à chaque modification.
 *
 * ⚠ LE PLANCHER N'EST PAS UNE TRICHE, ET LE TEXTE DOIT LE JUSTIFIER.
 *
 *   35 sur 100 pour une entreprise qui fait tout bien, ce n'est pas zéro, et
 *   c'est défendable : la fraude au président n'exploite AUCUNE faille
 *   technique. Elle exploite une procédure appliquée par des gens pressés.
 *   SPF, DKIM et DMARC n'arrêtent pas un domaine ressemblant légitimement
 *   déposé, et une double validation ne survit pas toujours à un dirigeant qui
 *   dit « faites-le maintenant ».
 *
 *   Ce raisonnement est écrit dans `SYNTHESES.modere` : le plancher est
 *   assumé devant le répondant, pas caché.
 *
 * ⚠ L'EFFECTIF ET LA MESSAGERIE NE PÈSENT PAS SUR LE SCORE. Être à 200 ne rend
 *   pas plus exposé qu'à 20 — ça rend la perte plus grosse, ce qui n'est pas la
 *   même chose. L'effectif sert à déduire l'offre, la messagerie à dire
 *   honnêtement si le produit couvre le cas.
 * ─────────────────────────────────────────────────────────────────────────
 */

/* ==========================================================================
   Les questions
   ========================================================================== */

export type CleQuestion =
  | "effectif"
  | "messagerie"
  | "validation"
  | "second_canal"
  | "exposition_dirigeants"
  | "domaine_protege"
  | "antecedent"
  | "domaine";

export type Option = {
  /** Valeur enregistrée en base. Ne jamais la renommer sans migration. */
  valeur: string;
  libelle: string;
  /** Précision affichée sous le libellé, quand le choix mérite d'être cadré. */
  precision?: string;
  /** Points ajoutés au score. Absent = question qui ne pèse pas. */
  poids?: number;
};

export type Question = {
  cle: CleQuestion;
  /** Le titre, court : c'est lui qui s'affiche en grand. */
  intitule: string;
  /** Une phrase qui lève l'ambiguïté. Sans elle, on mesure du bruit. */
  precision?: string;
  options?: Option[];
  /** Question à saisie libre (une seule : le domaine). */
  saisieLibre?: { placeholder: string; facultatif: true };
};

export const QUESTIONS: Question[] = [
  {
    cle: "effectif",
    intitule: "Combien de personnes travaillent dans l’entreprise ?",
    precision:
      "Cette réponse ne pèse pas sur le score. Elle sert à vous indiquer l’offre correspondante.",
    options: [
      { valeur: "1-25", libelle: "1 à 25" },
      { valeur: "26-75", libelle: "26 à 75" },
      { valeur: "76-200", libelle: "76 à 200" },
      { valeur: "200+", libelle: "Plus de 200" },
    ],
  },
  {
    cle: "messagerie",
    intitule: "Quelle messagerie utilisez-vous ?",
    precision:
      "Safentreprise se branche aujourd’hui sur Microsoft 365 uniquement. Nous le disons avant de vous faire répondre au reste.",
    options: [
      { valeur: "microsoft-365", libelle: "Microsoft 365" },
      { valeur: "google-workspace", libelle: "Google Workspace" },
      { valeur: "autre", libelle: "Autre / je ne sais pas" },
    ],
  },
  {
    cle: "validation",
    intitule: "Qui peut déclencher un virement fournisseur ?",
    precision:
      "On parle du paiement effectivement émis, pas de la saisie de la facture.",
    options: [
      {
        valeur: "une-personne",
        libelle: "Une seule personne",
        precision: "Elle peut engager un paiement sans que personne ne le revoie.",
        poids: 20,
      },
      {
        valeur: "deux-trois",
        libelle: "Deux ou trois personnes",
        precision: "Avec une validation croisée au-delà d’un certain montant.",
        poids: 10,
      },
      {
        valeur: "toute-la-compta",
        libelle: "Toute la comptabilité",
        precision: "Chacun peut émettre un virement dans son périmètre.",
        poids: 25,
      },
    ],
  },
  {
    cle: "second_canal",
    intitule:
      "Un changement de coordonnées bancaires est-il vérifié par un second canal ?",
    precision:
      "Second canal veut dire : un appel sur le numéro que vous aviez déjà — jamais celui écrit dans le message qui annonce le changement.",
    options: [
      {
        valeur: "toujours",
        libelle: "Toujours",
        precision: "Sans exception, même quand c’est urgent.",
        poids: 5,
      },
      {
        valeur: "parfois",
        libelle: "Parfois",
        precision: "Selon le montant, le fournisseur, ou la charge du moment.",
        poids: 15,
      },
      { valeur: "non", libelle: "Non", poids: 25 },
      { valeur: "inconnu", libelle: "Je ne sais pas", poids: 20 },
    ],
  },
  {
    cle: "exposition_dirigeants",
    intitule: "Vos dirigeants sont-ils identifiables publiquement ?",
    precision:
      "Site, LinkedIn, mentions légales, presse locale, registre du commerce.",
    options: [
      {
        valeur: "oui",
        libelle: "Oui",
        precision: "Nom, fonction et photo se trouvent en quelques minutes.",
        poids: 15,
      },
      {
        valeur: "partiellement",
        libelle: "Partiellement",
        precision: "Le nom circule, le reste est plus difficile à recouper.",
        poids: 10,
      },
      { valeur: "non", libelle: "Non", poids: 5 },
    ],
  },
  {
    cle: "domaine_protege",
    intitule: "Votre domaine est-il protégé contre l’usurpation ?",
    precision:
      "SPF, DKIM et DMARC en rejet — les trois enregistrements qui empêchent d’écrire AVEC votre propre adresse.",
    options: [
      { valeur: "oui", libelle: "Oui, DMARC en rejet", poids: 3 },
      { valeur: "non", libelle: "Non", poids: 15 },
      { valeur: "inconnu", libelle: "Je ne sais pas", poids: 12 },
    ],
  },
  {
    cle: "antecedent",
    intitule:
      "Avez-vous déjà reçu une tentative de fraude au président ou au fournisseur ?",
    options: [
      {
        valeur: "oui-paiement",
        libelle: "Oui, avec un paiement parti",
        poids: 20,
      },
      { valeur: "oui-reperee", libelle: "Oui, repérée à temps", poids: 12 },
      { valeur: "non", libelle: "Non, jamais", poids: 5 },
      { valeur: "inconnu", libelle: "Je ne sais pas", poids: 10 },
    ],
  },
  {
    cle: "domaine",
    intitule: "Le domaine de votre entreprise ?",
    precision:
      "Facultatif. Il nous sert à regarder les domaines proches déjà déposés avant l’échange. Vous pouvez passer.",
    saisieLibre: { placeholder: "exemple.fr", facultatif: true },
  },
];

/** Les questions qui pèsent, dans l'ordre du parcours. */
export const QUESTIONS_NOTEES: CleQuestion[] = [
  "validation",
  "second_canal",
  "exposition_dirigeants",
  "domaine_protege",
  "antecedent",
];

/* ==========================================================================
   Le calcul
   ========================================================================== */

/** Une réponse par clé de question. Les questions non répondues sont absentes. */
export type Reponses = Partial<Record<CleQuestion, string>>;

export const PLANCHER = 35;
export const PLAFOND = 95;

export type Palier = "eleve" | "significatif" | "modere";

export function palierDuScore(score: number): Palier {
  if (score >= 70) return "eleve";
  if (score >= 50) return "significatif";
  return "modere";
}

export const LIBELLE_PALIER: Record<Palier, string> = {
  eleve: "Exposition élevée",
  significatif: "Exposition significative",
  modere: "Exposition modérée",
};

/**
 * Le score, entre PLANCHER et PLAFOND.
 *
 * ⚠ UNE QUESTION NON RÉPONDUE NE COMPTE PAS POUR ZÉRO. Elle ne compte pas du
 *   tout : le parcours empêche de sauter une question notée, et un appel
 *   partiel (une route qui reçoit un corps tronqué) doit rendre un score bas
 *   plutôt qu'un score faussement rassurant construit sur du vide.
 */
export function calculerScore(reponses: Reponses): number {
  let total = 0;

  for (const cle of QUESTIONS_NOTEES) {
    const option = trouverOption(cle, reponses[cle]);
    if (option?.poids) total += option.poids;
  }

  return Math.min(PLAFOND, Math.max(PLANCHER, total));
}

export function trouverOption(
  cle: CleQuestion,
  valeur: string | undefined,
): Option | undefined {
  if (!valeur) return undefined;
  return QUESTIONS.find((q) => q.cle === cle)?.options?.find(
    (o) => o.valeur === valeur,
  );
}

/* ==========================================================================
   Le détail — ce que chaque réponse implique, et ce qu'on fait dessus
   ========================================================================== */

export type LigneDetail = {
  cle: CleQuestion;
  /** Le titre de la ligne, qui reprend la réponse donnée. */
  constat: string;
  /** Ce que ça veut dire concrètement le jour d'une tentative. */
  implication: string;
  /** Ce que Safentreprise fait dessus. Jamais une promesse que le code ne tient pas. */
  reponse: string;
  poids: number;
};

/**
 * Les textes, par question puis par réponse.
 *
 * ⚠ `reponse` NE DOIT DÉCRIRE QUE CE QUE LE PRODUIT FAIT RÉELLEMENT. Il
 *   analyse les messages entrants d'une boîte Microsoft 365, pose un
 *   avertissement dans le message, et prévient le dirigeant. Il ne bloque pas
 *   un virement, ne lit pas la banque, et ne surveille pas les dépôts de
 *   domaine en continu. Écrire le contraire ici, c'est engager une mesure que
 *   le code n'applique pas.
 */
const TEXTES: Record<string, { implication: string; reponse: string }> = {
  "validation:une-personne": {
    implication:
      "Un seul message convaincant suffit : il n’existe aucun second regard entre la demande et le paiement.",
    reponse:
      "L’avertissement est posé dans le message lui-même, avant que cette personne ne le lise — c’est le seul contrôle qui s’interpose quand il n’y en a pas d’autre.",
  },
  "validation:deux-trois": {
    implication:
      "La validation croisée arrête les demandes grossières. Elle cède quand les deux valideurs reçoivent la même histoire et se croient couverts l’un par l’autre.",
    reponse:
      "L’avertissement est visible par tous les destinataires du message, pas seulement par le premier à l’ouvrir.",
  },
  "validation:toute-la-compta": {
    implication:
      "La tentative ne cherche pas la bonne personne : elle cherche la plus disponible. Plus il y a d’émetteurs possibles, plus il y en a un qui répondra vite.",
    reponse:
      "Toutes les boîtes que vous désignez sont surveillées, pas seulement celle du responsable.",
  },

  "second_canal:toujours": {
    implication:
      "C’est la mesure la plus efficace qui existe contre le faux fournisseur. Elle tient tant qu’elle résiste à l’urgence — et l’urgence est justement ce que la fraude fabrique.",
    reponse:
      "L’avertissement nomme le motif de doute dans le message, ce qui donne à la personne une raison écrite de tenir sa procédure face à quelqu’un qui la presse.",
  },
  "second_canal:parfois": {
    implication:
      "« Parfois » veut dire : selon le montant, le fournisseur, et la charge du moment. Une tentative sérieuse vise précisément un montant plausible et une période chargée.",
    reponse:
      "La détection ne dépend ni du montant ni du moment : un changement de coordonnées bancaires annoncé par message est signalé à chaque fois.",
  },
  "second_canal:non": {
    implication:
      "Un changement de RIB annoncé par message est appliqué sur la foi du message. C’est le scénario de fraude au fournisseur dans sa forme la plus simple.",
    reponse:
      "Le message annonçant un changement de coordonnées bancaires est repéré et porte un avertissement, et le dirigeant en est averti séparément.",
  },
  "second_canal:inconnu": {
    implication:
      "Si la règle existait et était appliquée, quelqu’un dans l’entreprise le saurait. Ne pas savoir revient, en pratique, à « pas toujours ».",
    reponse:
      "La détection ne suppose aucune procédure de votre côté pour fonctionner.",
  },

  "exposition_dirigeants:oui": {
    implication:
      "Nom, fonction, ton, organigramme : tout ce qu’il faut pour écrire un message crédible se trouve publiquement, sans rien avoir à pirater.",
    reponse:
      "Les noms de vos dirigeants sont connus du moteur : un message qui les invoque depuis une adresse extérieure est traité différemment d’un message ordinaire.",
  },
  "exposition_dirigeants:partiellement": {
    implication:
      "Le nom du dirigeant circule, ce qui suffit à ouvrir un message. Le reste demande un effort — que la plupart des tentatives ne feront pas.",
    reponse:
      "Le rapprochement se fait sur le nom ET sur l’adresse d’envoi : un nom connu porté par une adresse inconnue est un signal en soi.",
  },
  "exposition_dirigeants:non": {
    implication:
      "C’est un frein réel, mais il vaut pour les tentatives de masse. Une attaque préparée trouve un nom de dirigeant dans un registre public en dix minutes.",
    reponse:
      "La détection ne repose pas sur le fait que le nom soit difficile à trouver.",
  },

  "domaine_protege:oui": {
    implication:
      "Personne ne peut écrire depuis votre propre domaine. C’est acquis — et ça ne couvre pas le cas le plus fréquent : un domaine VOISIN, déposé légitimement, qui passe tous les contrôles.",
    reponse:
      "La ressemblance entre le domaine d’envoi et le vôtre est mesurée à chaque message : c’est exactement l’angle que SPF, DKIM et DMARC ne couvrent pas.",
  },
  "domaine_protege:non": {
    implication:
      "Sans DMARC en rejet, un message peut porter votre propre adresse d’expéditeur et arriver dans les boîtes de vos équipes.",
    reponse:
      "L’écart entre le nom affiché et l’adresse réelle est vérifié sur chaque message, y compris quand l’adresse affichée est la vôtre.",
  },
  "domaine_protege:inconnu": {
    implication:
      "C’est vérifiable en une minute depuis l’extérieur, par vous comme par quelqu’un qui prépare une tentative. Il vaut mieux que ce soit vous.",
    reponse:
      "Nous regardons l’état de vos enregistrements pendant la mise en service, et vous dites ce qu’il manque même si vous ne prenez rien.",
  },

  "antecedent:oui-paiement": {
    implication:
      "Vous êtes dans une liste qui circule. Une entreprise qui a payé une fois est recontactée, souvent sous un autre prétexte.",
    reponse:
      "La surveillance est continue et sans échéance : elle ne dépend pas du souvenir que l’équipe garde de l’épisode précédent.",
  },
  "antecedent:oui-reperee": {
    implication:
      "Quelqu’un a eu le bon réflexe ce jour-là. Ce n’est pas une garantie pour la prochaine fois : la vigilance retombe en quelques semaines.",
    reponse:
      "Le signalement ne dépend pas de la vigilance du moment, et le dirigeant est averti même si personne ne remonte l’information.",
  },
  "antecedent:non": {
    implication:
      "Ou bien aucune tentative n’est arrivée, ou bien elle n’a pas été reconnue comme telle. Une tentative ratée ne laisse aucune trace visible.",
    reponse:
      "Chaque message analysé laisse une trace datée, ce qui permet de savoir ce qui est arrivé — et pas seulement ce qui a été remarqué.",
  },
  "antecedent:inconnu": {
    implication:
      "Les tentatives qui échouent ne remontent presque jamais jusqu’à la direction. L’absence de signalement n’est pas une absence de tentative.",
    reponse:
      "Le dirigeant reçoit une alerte à chaque détection, sans dépendre de ce que l’équipe choisit de faire remonter.",
  },
};

/** Le détail, trié du plus lourd au plus léger. */
export function detailler(reponses: Reponses): LigneDetail[] {
  const lignes: LigneDetail[] = [];

  for (const cle of QUESTIONS_NOTEES) {
    const valeur = reponses[cle];
    const option = trouverOption(cle, valeur);
    const textes = TEXTES[`${cle}:${valeur}`];
    if (!option || !textes) continue;

    lignes.push({
      cle,
      constat: `${intituleCourt(cle)} — ${option.libelle.toLowerCase()}`,
      implication: textes.implication,
      reponse: textes.reponse,
      poids: option.poids ?? 0,
    });
  }

  return lignes.sort((a, b) => b.poids - a.poids);
}

/** Titre de ligne dans le détail : plus court que l'intitulé de la question. */
function intituleCourt(cle: CleQuestion): string {
  switch (cle) {
    case "validation":
      return "Déclenchement d’un virement";
    case "second_canal":
      return "Vérification d’un changement de RIB";
    case "exposition_dirigeants":
      return "Dirigeants identifiables";
    case "domaine_protege":
      return "Protection du domaine";
    case "antecedent":
      return "Tentative déjà reçue";
    default:
      return cle;
  }
}

/* ==========================================================================
   La synthèse
   ========================================================================== */

/**
 * Une phrase par palier.
 *
 * ⚠ LE PALIER LE PLUS BAS RESTE FERME, ET CE N'EST PAS UN ARTIFICE DE VENTE.
 *   Dire « vous êtes tranquilles » à une entreprise qui a de bonnes procédures
 *   serait faux : la fraude au président n'attaque pas les procédures, elle
 *   attaque les gens qui les appliquent. Le texte doit l'expliquer plutôt que
 *   de se contenter d'un ton grave.
 */
export const SYNTHESES: Record<Palier, string> = {
  eleve:
    "Une tentative bien préparée a de bonnes chances d’aboutir chez vous. Les points ci-dessous ne sont pas des négligences isolées : pris ensemble, ils décrivent un circuit où une demande de paiement crédible n’est arrêtée par rien.",
  significatif:
    "Vos défenses arrêteraient une tentative grossière. Elles laisseraient passer une tentative préparée — celle qui connaît le nom de votre dirigeant, le moment où vos équipes sont chargées, et le vocabulaire de vos échanges.",
  modere:
    "Vos procédures sont au-dessus de ce que nous voyons habituellement, et le score le reflète. Il ne descend pas plus bas pour une raison précise : la fraude au président n’exploite aucune faille technique. Une procédure écrite ne détecte pas un domaine qui ressemble au vôtre, et une équipe sous pression finit par céder à l’urgence — c’est exactement ce que la tentative fabrique.",
};

/* ==========================================================================
   L'offre déduite de l'effectif
   ========================================================================== */

export type OffreDiagnostic = {
  nom: string;
  effectif: string;
  /** `null` = au-delà de la grille : nous consulter. */
  prix: { miseEnService: number; mensuel: number } | null;
};

/**
 * ⚠ LES MONTANTS VIENNENT DE `tarifs.ts`, SOURCE UNIQUE. Les recopier ici
 *   garantissait qu'une des deux pages finisse par mentir sur le prix.
 */
export function offrePourEffectif(
  effectif: string | undefined,
  grille: { cle: string; nom: string; effectif: string; prix: { auditInitial: number; abonnementMensuel: number } | null }[],
): OffreDiagnostic | null {
  const correspondance: Record<string, string> = {
    "1-25": "essentiel",
    "26-75": "business",
    "76-200": "entreprise",
  };

  if (effectif === "200+") {
    return {
      nom: "Au-delà de 200 collaborateurs",
      effectif: "Plus de 200 collaborateurs",
      prix: null,
    };
  }

  const offre = grille.find((o) => o.cle === correspondance[effectif ?? ""]);
  if (!offre) return null;

  return {
    nom: offre.nom,
    effectif: offre.effectif,
    prix: offre.prix
      ? {
          miseEnService: offre.prix.auditInitial,
          mensuel: offre.prix.abonnementMensuel,
        }
      : null,
  };
}

/* ==========================================================================
   Le domaine saisi
   ========================================================================== */

/** Longueur maximale d'un nom de domaine (RFC 1035). */
export const LONGUEUR_MAX_DOMAINE = 253;

/**
 * Nettoie le domaine tapé par le répondant.
 *
 * ⚠ ON NETTOIE PLUTÔT QUE DE REFUSER. La moitié des gens colleront l'URL de
 *   leur site — `https://www.exemple.fr/contact` — et refuser cette saisie
 *   ferait perdre l'information pour une question de forme. On retire le
 *   protocole, le `www.` et le chemin, et on garde ce qui reste.
 *
 * ⚠ PAS DE VALIDATION STRICTE. Un domaine mal orthographié reste plus utile
 *   qu'un champ vide : il sera lu par un humain avant le rendez-vous, pas par
 *   un résolveur DNS.
 */
export function nettoyerDomaine(brut: string): string {
  return brut
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .slice(0, LONGUEUR_MAX_DOMAINE);
}

/** Vrai quand la messagerie déclarée sort du périmètre couvert aujourd'hui. */
export function horsPerimetre(reponses: Reponses): boolean {
  return reponses.messagerie !== undefined && reponses.messagerie !== "microsoft-365";
}
