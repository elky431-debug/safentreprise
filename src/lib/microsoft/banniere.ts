/**
 * Bannière d'alerte : construction, pose, et RETRAIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PRINCIPE : AUCUN CORPS N'EST STOCKÉ.
 *
 * On n'a pas de copie du mail d'origine, et on n'en veut pas — ce serait
 * stocker du contenu de message, ce que ce produit s'interdit. La bannière
 * est donc encadrée par deux marqueurs, et la restauration est une DÉCOUPE :
 * on retire tout ce qui se trouve entre le marqueur d'ouverture et celui de
 * fermeture, bornes comprises. Ce qui reste est exactement le corps
 * d'origine, au caractère près.
 *
 * Pour que cette découpe soit sûre, deux invariants que le reste du fichier
 * doit respecter :
 *
 *   1. La bannière ne contient AUCUN <div> imbriqué. C'est ce qui rend le
 *      repli sur la balise fiable : on peut couper jusqu'au premier </div>
 *      sans risquer de couper au mauvais endroit.
 *   2. Aucun texte fourni par l'extérieur n'entre dans le HTML sans être
 *      échappé. Un signal contient le nom et l'adresse de l'expéditeur,
 *      c'est-à-dire du texte que l'attaquant contrôle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN REPLI SUR LA BALISE.
 *
 * Exchange normalise le HTML qu'on lui envoie. On ne sait pas d'avance s'il
 * conserve les commentaires HTML. S'il les retire, les marqueurs
 * disparaissent et la bannière devient indélébile — exactement ce qu'on ne
 * peut pas se permettre. La bannière porte donc aussi un attribut
 * `data-safentreprise`, qui a bien plus de chances de survivre, et le
 * retrait sait travailler avec l'un ou l'autre.
 *
 * L'appelant doit VÉRIFIER après écriture que la bannière est retrouvable,
 * et revenir en arrière si elle ne l'est pas.
 */

export const MARQUEUR_DEBUT = "<!--SAFENTREPRISE-BANNIERE:DEBUT-->";
export const MARQUEUR_FIN = "<!--SAFENTREPRISE-BANNIERE:FIN-->";

/**
 * Marqueurs de la version TEXTE BRUT.
 *
 * Un corps text/plain n'a pas de commentaires : les marqueurs y sont
 * forcément visibles. On en fait donc des séparateurs qui ont l'air d'être là
 * pour le lecteur — ils délimitent l'encadré autant qu'ils servent à la
 * découpe. Chacun porte le mot SAFENTREPRISE : une ligne de « = » toute seule
 * apparaît dans de vraies signatures, celles-ci non.
 *
 * ⚠ ON NE CONVERTIT JAMAIS UN CORPS TEXTE EN HTML. Ce serait techniquement
 *   possible, mais la restauration rendrait alors du HTML là où il y avait du
 *   texte : le message resterait transformé même après retrait de la
 *   bannière. La découpe doit rendre EXACTEMENT ce qu'il y avait avant, ce
 *   qui impose de rester dans le format d'origine.
 */
export const MARQUEUR_TEXTE_DEBUT = "===== SAFENTREPRISE — AVERTISSEMENT =====";
export const MARQUEUR_TEXTE_FIN =
  "===== SAFENTREPRISE — FIN DE L'AVERTISSEMENT =====";

/** Au-delà, on coupe : un corps texte se lit mal en lignes trop longues. */
const LARGEUR_TEXTE = 72;

/** Repère de repli, si les commentaires ne survivent pas à Exchange. */
const ATTRIBUT = "data-safentreprise";

export type NiveauBanniere = "faible" | "modere" | "eleve";

export type ContenuBanniere = {
  niveau: NiveauBanniere;
  score: number;
  signaux: string[];
};

/* ==========================================================================
   Échappement
   ========================================================================== */

/**
 * Échappe le texte destiné au HTML.
 *
 * Les signaux citent le nom affiché et l'adresse de l'expéditeur. Un
 * expéditeur qui se nomme `<img src=x onerror=…>` écrirait sinon dans le
 * corps du mail de sa victime, avec notre signature — on injecterait nous-
 * mêmes ce qu'on prétend détecter.
 */
export function echapper(texte: string): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ==========================================================================
   Construction
   ========================================================================== */

const APPARENCE: Record<
  NiveauBanniere,
  { fond: string; bord: string; texte: string; titre: string }
> = {
  eleve: {
    fond: "#fdf2f2",
    bord: "#c0392b",
    texte: "#7b241c",
    titre: "Risque élevé de fraude",
  },
  modere: {
    fond: "#fef6ec",
    bord: "#d68910",
    texte: "#7e5109",
    titre: "Message suspect",
  },
  faible: {
    fond: "#fdfaec",
    bord: "#b7950b",
    texte: "#7d6608",
    titre: "Message à vérifier",
  },
};

/**
 * HTML de la bannière.
 *
 * Styles en ligne uniquement : les clients de messagerie ignorent les
 * feuilles de style et une bonne partie des sélecteurs. Pas de <div>
 * imbriqué, pas de balise auto-fermante exotique, rien qui ne survive pas à
 * un passage dans Outlook mobile.
 */
export function construireBanniere(contenu: ContenuBanniere): string {
  const apparence = APPARENCE[contenu.niveau] ?? APPARENCE.faible;

  const signaux = contenu.signaux
    .slice(0, 5)
    .map(
      (s) =>
        `<li style="margin:0 0 4px 0;">${echapper(s)}</li>`,
    )
    .join("");

  // Une seule <div>, celle du repère. Tout le reste est du <p>, <ul>, <li>,
  // <strong> : voir l'invariant en tête de fichier.
  const corps =
    `<div ${ATTRIBUT}="banniere" style="` +
    `background:${apparence.fond};` +
    `border-left:4px solid ${apparence.bord};` +
    `color:${apparence.texte};` +
    `padding:12px 16px;margin:0 0 16px 0;` +
    `font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;` +
    `line-height:1.5;">` +
    `<p style="margin:0 0 8px 0;font-weight:600;font-size:15px;">` +
    `⚠ Safentreprise — ${echapper(apparence.titre)}` +
    `</p>` +
    `<ul style="margin:0 0 8px 0;padding-left:20px;">${signaux}</ul>` +
    `<p style="margin:0;font-size:13px;">` +
    `Ne donnez pas suite sans vérifier par un autre moyen — appelez votre ` +
    `interlocuteur sur un numéro que vous connaissez déjà, jamais sur un ` +
    `numéro indiqué dans ce message.` +
    `</p>` +
    `</div>`;

  return MARQUEUR_DEBUT + corps + MARQUEUR_FIN;
}

/* ==========================================================================
   Version texte brut
   ========================================================================== */

/** Coupe un paragraphe à la largeur voulue, sans casser les mots. */
function replier(texte: string, largeur: number, retrait = ""): string[] {
  const mots = String(texte).split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = retrait;

  for (const mot of mots) {
    if (courante.trim() && courante.length + 1 + mot.length > largeur) {
      lignes.push(courante);
      courante = retrait + mot;
    } else {
      courante = courante.trim() ? `${courante} ${mot}` : retrait + mot;
    }
  }
  if (courante.trim()) lignes.push(courante);
  return lignes;
}

const TITRES_TEXTE: Record<NiveauBanniere, string> = {
  eleve: "RISQUE ÉLEVÉ DE FRAUDE",
  modere: "MESSAGE SUSPECT",
  faible: "MESSAGE À VÉRIFIER",
};

/**
 * Bannière en texte brut, pour les corps text/plain.
 *
 * Même avertissement que la version HTML, mis en forme avec des caractères
 * simples. Aucune balise : dans un corps texte, elles s'afficheraient telles
 * quelles et le message serait pire qu'avant.
 *
 * Rien n'est échappé ici, et c'est correct : en texte brut il n'existe pas de
 * balise à neutraliser. Le seul risque serait qu'un signal contienne une de
 * nos lignes de marquage — c'est pourquoi la construction les retire.
 */
export function construireBanniereTexte(contenu: ContenuBanniere): string {
  const titre = TITRES_TEXTE[contenu.niveau] ?? TITRES_TEXTE.faible;

  const lignes: string[] = [
    MARQUEUR_TEXTE_DEBUT,
    `/!\\  ${titre}`,
    "",
  ];

  for (const signal of contenu.signaux.slice(0, 5)) {
    // Un signal ne doit jamais contenir un marqueur : il découperait la
    // bannière au mauvais endroit et rendrait la restauration fausse.
    const propre = String(signal)
      .split(MARQUEUR_TEXTE_DEBUT).join("")
      .split(MARQUEUR_TEXTE_FIN).join("")
      .replace(/\s+/g, " ")
      .trim();
    // La continuation s'aligne sous le texte, pas sous le tiret : une puce
    // qui se poursuit dans la marge se lit comme un nouveau point.
    const [premiere, ...suite] = replier(propre, LARGEUR_TEXTE - 4, "");
    lignes.push(`  - ${premiere}`);
    for (const l of suite) lignes.push(`    ${l}`);
  }

  lignes.push("");
  lignes.push(
    ...replier(
      "Ne donnez pas suite sans vérifier par un autre moyen : appelez " +
        "votre interlocuteur sur un numéro que vous connaissez déjà, jamais " +
        "sur un numéro indiqué dans ce message.",
      LARGEUR_TEXTE,
    ),
  );
  lignes.push(MARQUEUR_TEXTE_FIN);

  // Les deux sauts finaux séparent la bannière du message et font partie de
  // ce que la découpe retire.
  return lignes.join("\n") + "\n\n";
}

/** Pose la bannière texte en tête du corps. */
export function poserBanniereTexte(texte: string, banniere: string): string {
  return banniere + retirerBanniere(texte).html;
}

/* ==========================================================================
   Retrait — la découpe
   ========================================================================== */

const ENTRE_MARQUEURS = new RegExp(
  `${MARQUEUR_DEBUT}[\\s\\S]*?${MARQUEUR_FIN}`,
  "g",
);

// Repli : la <div> repérable, sans <div> imbriqué (invariant 1), donc la
// première </div> rencontrée est bien la sienne.
const DIV_REPERE = new RegExp(
  `<div[^>]*\\s${ATTRIBUT}\\s*=\\s*["']?banniere["']?[^>]*>[\\s\\S]*?<\\/div>`,
  "gi",
);

/** Échappe une chaîne pour l'insérer dans une expression régulière. */
function echapperRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Les deux sauts de ligne finaux font partie de la bannière : on les retire
// avec elle. Ils sont tolérés absents — un corps vide n'en a pas — et en
// \r\n, Exchange normalisant parfois les fins de ligne.
const ENTRE_MARQUEURS_TEXTE = new RegExp(
  echapperRegex(MARQUEUR_TEXTE_DEBUT) +
    "[\\s\\S]*?" +
    echapperRegex(MARQUEUR_TEXTE_FIN) +
    "(?:\\r?\\n){0,2}",
  "g",
);

export type Retrait = {
  html: string;
  /** Combien de bannières ont été retirées. */
  retirees: number;
  /** Comment on les a retrouvées. */
  methode: "marqueurs" | "marqueurs-texte" | "attribut" | "aucune";
};

/**
 * Retire toute bannière du corps, et rend le corps d'origine.
 *
 * Essaie d'abord les marqueurs — la découpe exacte. À défaut, retombe sur la
 * balise repère, au cas où Exchange aurait mangé les commentaires.
 */
export function retirerBanniere(html: string): Retrait {
  const source = String(html ?? "");

  if (ENTRE_MARQUEURS.test(source)) {
    ENTRE_MARQUEURS.lastIndex = 0;
    const trouvees = source.match(ENTRE_MARQUEURS)?.length ?? 0;
    return {
      html: source.replace(ENTRE_MARQUEURS, ""),
      retirees: trouvees,
      methode: "marqueurs",
    };
  }
  ENTRE_MARQUEURS.lastIndex = 0;

  if (ENTRE_MARQUEURS_TEXTE.test(source)) {
    ENTRE_MARQUEURS_TEXTE.lastIndex = 0;
    const trouvees = source.match(ENTRE_MARQUEURS_TEXTE)?.length ?? 0;
    return {
      html: source.replace(ENTRE_MARQUEURS_TEXTE, ""),
      retirees: trouvees,
      methode: "marqueurs-texte",
    };
  }
  ENTRE_MARQUEURS_TEXTE.lastIndex = 0;

  if (DIV_REPERE.test(source)) {
    DIV_REPERE.lastIndex = 0;
    const trouvees = source.match(DIV_REPERE)?.length ?? 0;
    return {
      html: source.replace(DIV_REPERE, ""),
      retirees: trouvees,
      methode: "attribut",
    };
  }
  DIV_REPERE.lastIndex = 0;

  return { html: source, retirees: 0, methode: "aucune" };
}

/** Le corps porte-t-il déjà une bannière ? */
export function contientBanniere(html: string): boolean {
  return retirerBanniere(html).retirees > 0;
}

/**
 * Pose la bannière en tête du corps.
 *
 * Retire d'abord toute bannière existante : sans ça, une seconde analyse du
 * même message les empilerait. C'est ce qui rend l'opération idempotente —
 * poser deux fois revient à poser une fois.
 */
export function poserBanniere(html: string, banniere: string): string {
  const propre = retirerBanniere(html).html;

  // Juste après <body …>, s'il y en a un. Sinon en tête : un corps Graph est
  // souvent un fragment sans <html> ni <body>.
  const body = propre.match(/<body[^>]*>/i);
  if (body && body.index !== undefined) {
    const apres = body.index + body[0].length;
    return propre.slice(0, apres) + banniere + propre.slice(apres);
  }

  return banniere + propre;
}
