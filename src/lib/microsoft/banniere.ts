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

export type Retrait = {
  html: string;
  /** Combien de bannières ont été retirées. */
  retirees: number;
  /** Comment on les a retrouvées. */
  methode: "marqueurs" | "attribut" | "aucune";
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
