/**
 * Conversion du corps d'un mail en texte exploitable par le moteur.
 *
 * POURQUOI CETTE BRIQUE EST CRITIQUE
 *
 * Le moteur cherche la signature dans les huit dernières lignes non vides du
 * corps. Deux choses la mettent en échec, et ce sont exactement celles que ce
 * module traite :
 *
 *   • Un corps HTML brut. Les dernières lignes sont alors des balises de
 *     fermeture, la signature n'est jamais trouvée, et le signal principal
 *     du moteur disparaît.
 *
 *   • Un fil de citation. Les dernières lignes appartiennent au message
 *     CITÉ, pas à celui qu'on analyse. Le moteur lit alors la signature de
 *     la mauvaise personne — un faux résultat, pire qu'une absence.
 *
 * S'y ajoute le texte masqué, qui n'est pas un détail cosmétique mais une
 * technique d'évasion : caractères de largeur nulle glissés dans un mot pour
 * casser la recherche par mot-clé, blocs en `display:none` portant une fausse
 * signature, préen-têtes invisibles.
 *
 * AUCUNE DÉPENDANCE. Pas de jsdom, pas de cheerio : ce code tourne dans une
 * fonction serverless où chaque milliseconde de démarrage à froid compte, et
 * l'analyse d'un corps de mail ne justifie pas un moteur de rendu complet.
 * La contrepartie est assumée : on ne construit pas d'arbre DOM, on travaille
 * par balayage. Les limites sont documentées au fil du code.
 */
"use strict";

/* ==========================================================================
   Caractères invisibles
   ========================================================================== */

/**
 * Caractères sans largeur, utilisés pour casser la détection par mot-clé :
 * « vi<U+200B>rement » ne correspond plus à « virement ».
 * On les retire au lieu de les remplacer par un espace : le mot doit se
 * recoller.
 */
const INVISIBLES =
  /[­​‌‍⁠⁡⁢⁣⁤﻿]/g;

/** Espaces exotiques ramenés à l'espace ordinaire. */
const ESPACES_EXOTIQUES = /[   -   　]/g;

/* ==========================================================================
   Entités HTML
   ========================================================================== */

const ENTITES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  oelig: "œ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  euro: "€",
  deg: "°",
  middot: "·",
  times: "×",
  trade: "™",
  copy: "©",
  reg: "®",
};

/** Décode les entités nommées courantes et toutes les entités numériques. */
function decoderEntites(texte) {
  return texte.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (tout, corps) => {
    if (corps[0] === "#") {
      const code =
        corps[1] === "x" || corps[1] === "X"
          ? Number.parseInt(corps.slice(2), 16)
          : Number.parseInt(corps.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return tout;
      try {
        return String.fromCodePoint(code);
      } catch {
        return tout;
      }
    }
    const connu = ENTITES[corps.toLowerCase()];
    return connu === undefined ? tout : connu;
  });
}

/* ==========================================================================
   Texte masqué
   ========================================================================== */

/**
 * Signatures de style qui rendent un bloc invisible à l'écran.
 * `mso-hide:all` est propre à Outlook, `max-height:0` sert aux préen-têtes.
 */
const STYLE_MASQUE =
  /(display\s*:\s*none)|(visibility\s*:\s*hidden)|(mso-hide\s*:\s*all)|(font-size\s*:\s*0(px|pt|em)?\b)|(opacity\s*:\s*0(\.0+)?\s*[;"'])|(max-height\s*:\s*0(px|pt)?\b)/i;

/** Le texte est-il de la même couleur que le fond déclaré sur le même bloc ? */
function couleurSurFondIdentique(attributs) {
  const couleur = attributs.match(/(?:^|[;"'\s])color\s*:\s*([^;"']+)/i);
  const fond = attributs.match(
    /(?:^|[;"'\s])background(?:-color)?\s*:\s*([^;"']+)/i,
  );
  if (!couleur || !fond) return false;
  const normaliser = (v) =>
    v
      .trim()
      .toLowerCase()
      .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3");
  return normaliser(couleur[1]) === normaliser(fond[1]);
}

/** Balises pour lesquelles on sait sauter un bloc entier. */
const BLOCS_SAUTABLES = new Set([
  "div",
  "span",
  "p",
  "table",
  "tr",
  "td",
  "font",
  "section",
  "a",
]);

/**
 * Retire les blocs invisibles, en gérant l'imbrication de la même balise.
 *
 * Limite assumée : sans arbre DOM, un HTML mal fermé peut faire sauter plus
 * que prévu. On borne donc la recherche de fermeture ; au-delà, on préfère
 * garder le texte que d'en perdre.
 */
function supprimerBlocsMasques(html) {
  const OUVRANTE = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let resultat = "";
  let curseur = 0;
  let blocs = 0;
  let trouve;

  while ((trouve = OUVRANTE.exec(html)) !== null) {
    const [balise, nom, attributs] = trouve;
    const minuscule = nom.toLowerCase();

    const masque =
      /\bhidden\b/i.test(attributs) ||
      STYLE_MASQUE.test(attributs) ||
      couleurSurFondIdentique(attributs);

    if (!masque || !BLOCS_SAUTABLES.has(minuscule)) continue;

    // Cherche la fermeture correspondante en comptant les imbrications.
    const suite = html.slice(trouve.index + balise.length);
    const JUMELLES = new RegExp(`<(/?)${minuscule}\\b[^>]*>`, "gi");
    let profondeur = 1;
    let fin = -1;
    let paire;

    while ((paire = JUMELLES.exec(suite)) !== null) {
      profondeur += paire[1] === "/" ? -1 : 1;
      if (profondeur === 0) {
        fin = trouve.index + balise.length + paire.index + paire[0].length;
        break;
      }
    }

    if (fin === -1) continue; // fermeture absente : on ne touche à rien

    resultat += html.slice(curseur, trouve.index);
    curseur = fin;
    blocs += 1;
    OUVRANTE.lastIndex = fin;
  }

  resultat += html.slice(curseur);
  return { html: resultat, blocs };
}

/* ==========================================================================
   Fil de citation
   ========================================================================== */

/**
 * Marqueurs STRUCTURELS du début d'un fil cité, dans le HTML.
 * Ce sont les conteneurs que posent les clients mail eux-mêmes : plus fiables
 * que la recherche textuelle, parce qu'ils ne dépendent pas de la langue.
 */
const MARQUEURS_HTML = [
  { nom: "outlook:appendonsend", motif: /<div[^>]*\bid\s*=\s*["']?appendonsend["']?/i },
  { nom: "outlook:divRplyFwdMsg", motif: /<div[^>]*\bid\s*=\s*["']?divRplyFwdMsg["']?/i },
  { nom: "outlook:stopSpelling", motif: /<hr[^>]*\bid\s*=\s*["']?stopSpelling["']?/i },
  { nom: "gmail:quote", motif: /<div[^>]*class\s*=\s*["'][^"']*\bgmail_quote\b/i },
  { nom: "yahoo:quoted", motif: /<div[^>]*\bclass\s*=\s*["'][^"']*\byahoo_quoted\b/i },
  { nom: "blockquote", motif: /<blockquote\b/i },
];

/**
 * Marqueurs TEXTUELS, en repli quand le HTML n'a rien de structurel —
 * cas des mails en texte brut et de certains clients mobiles.
 */
const MARQUEURS_TEXTE = [
  { nom: "outlook:entete-fr", motif: /^De\s*:.*$/im, exigeSuite: /^(Envoyé|Envoye|À|A)\s*:/im },
  { nom: "outlook:entete-en", motif: /^From\s*:.*$/im, exigeSuite: /^(Sent|To)\s*:/im },
  { nom: "gmail:a-ecrit", motif: /^Le\s+.{4,80}\s+a\s+écrit\s*:\s*$/im },
  { nom: "gmail:wrote", motif: /^On\s+.{4,80}\s+wrote\s*:\s*$/im },
  { nom: "message-origine-fr", motif: /^-{2,}\s*Message d['’]origine\s*-{2,}\s*$/im },
  { nom: "message-origine-en", motif: /^-{2,}\s*Original Message\s*-{2,}\s*$/im },
  { nom: "transfere-fr", motif: /^-{2,}\s*Message transféré\s*-{2,}\s*$/im },
  { nom: "separateur-outlook", motif: /^_{10,}\s*$/m },
];

/** Coupe le HTML au premier marqueur structurel rencontré. */
function couperCitationHtml(html) {
  let coupe = -1;
  let marqueur = null;

  for (const { nom, motif } of MARQUEURS_HTML) {
    const trouve = html.match(motif);
    if (trouve && trouve.index !== undefined) {
      if (coupe === -1 || trouve.index < coupe) {
        coupe = trouve.index;
        marqueur = nom;
      }
    }
  }

  if (coupe === -1) return { html, marqueur: null };
  return { html: html.slice(0, coupe), marqueur };
}

/** Coupe le texte au premier marqueur textuel rencontré. */
function couperCitationTexte(texte) {
  let coupe = -1;
  let marqueur = null;

  for (const { nom, motif, exigeSuite } of MARQUEURS_TEXTE) {
    const trouve = texte.match(motif);
    if (!trouve || trouve.index === undefined) continue;

    // « De : » seul ne suffit pas — il faut l'en-tête complet qui suit,
    // sinon on couperait un message qui commence par « De : la part de… ».
    if (exigeSuite) {
      const apres = texte.slice(trouve.index, trouve.index + 400);
      if (!exigeSuite.test(apres)) continue;
    }

    if (coupe === -1 || trouve.index < coupe) {
      coupe = trouve.index;
      marqueur = nom;
    }
  }

  // Bloc de lignes préfixées par « > » (citation en texte brut)
  const chevrons = texte.match(/^>[^\n]*$/m);
  if (chevrons && chevrons.index !== undefined) {
    if (coupe === -1 || chevrons.index < coupe) {
      coupe = chevrons.index;
      marqueur = "chevrons";
    }
  }

  if (coupe === -1) return { texte, marqueur: null };
  return { texte: texte.slice(0, coupe), marqueur };
}

/* ==========================================================================
   HTML -> texte
   ========================================================================== */

/** Balises dont le contenu ne doit jamais atterrir dans le texte. */
const BLOCS_IGNORES = /<(script|style|head|noscript|title)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Balises qui provoquent un saut de ligne à la fermeture. */
const FERMETURES_BLOC =
  /<\/(p|div|tr|li|ul|ol|h[1-6]|blockquote|table|section|article|header|footer|pre)\s*>/gi;

function htmlVersTexte(html) {
  let texte = html;

  texte = texte.replace(/<!--[\s\S]*?-->/g, " ");
  texte = texte.replace(BLOCS_IGNORES, " ");

  texte = texte.replace(/<br\s*\/?>/gi, "\n");
  texte = texte.replace(FERMETURES_BLOC, "\n");
  // Les cellules d'une même ligne ne doivent pas coller leurs mots.
  texte = texte.replace(/<\/t[dh]\s*>/gi, " ");
  texte = texte.replace(/<hr\s*\/?>/gi, "\n");

  // Tout le reste des balises disparaît sans laisser d'espace parasite.
  texte = texte.replace(/<[^>]+>/g, "");

  return texte;
}

/* ==========================================================================
   Normalisation finale
   ========================================================================== */

function normaliserTexte(texte) {
  let sortie = texte.replace(/\r\n?/g, "\n");
  sortie = sortie.replace(ESPACES_EXOTIQUES, " ");
  sortie = sortie.replace(/[ \t]+/g, " ");
  sortie = sortie
    .split("\n")
    .map((ligne) => ligne.trim())
    .join("\n");
  sortie = sortie.replace(/\n{3,}/g, "\n\n");
  return sortie.trim();
}

/* ==========================================================================
   Point d'entrée
   ========================================================================== */

/**
 * Convertit un corps de mail en texte exploitable.
 *
 * @param {string} contenu  corps du message, HTML ou texte brut
 * @param {{ format?: "html"|"text"|"auto", garderCitation?: boolean }} [options]
 * @returns {{
 *   texte: string,
 *   texteAvecCitation: string,
 *   citationRetiree: boolean,
 *   marqueurCitation: string|null,
 *   blocsMasques: number,
 *   invisiblesRetires: number,
 *   format: "html"|"texte"
 * }}
 */
function convertirCorps(contenu, options = {}) {
  const brut = String(contenu ?? "");
  const demande = options.format ?? "auto";

  const estHtml =
    demande === "html" ||
    (demande === "auto" && /<\s*(html|body|div|p|br|table|span)\b/i.test(brut));

  let invisiblesRetires = 0;

  /** Retire les invisibles sans compter. */
  const retirer = (valeur) => valeur.replace(INVISIBLES, "");

  /**
   * Retire ET compte. À n'utiliser QUE sur le corps complet : le texte est
   * converti deux fois, avec et sans citation, et compter aux deux passages
   * doublerait le total.
   */
  const compterEtRetirer = (valeur) =>
    valeur.replace(INVISIBLES, () => {
      invisiblesRetires += 1;
      return "";
    });

  if (!estHtml) {
    const nettoye = normaliserTexte(compterEtRetirer(decoderEntites(brut)));
    const { texte, marqueur } = couperCitationTexte(nettoye);
    return {
      texte: normaliserTexte(texte),
      texteAvecCitation: nettoye,
      citationRetiree: marqueur !== null,
      marqueurCitation: marqueur,
      blocsMasques: 0,
      invisiblesRetires,
      format: "texte",
    };
  }

  // 1. Blocs invisibles retirés AVANT la coupe : un fil cité peut être
  //    précédé d'un préen-tête masqué qui fausserait les positions.
  const { html: sansMasque, blocs } = supprimerBlocsMasques(brut);

  // 2. Coupe structurelle du fil cité, dans le HTML.
  const { html: sansCitation, marqueur: marqueurHtml } =
    couperCitationHtml(sansMasque);

  // Le corps complet est le seul passage où l'on compte les invisibles.
  const texteComplet = normaliserTexte(
    compterEtRetirer(decoderEntites(htmlVersTexte(sansMasque))),
  );

  let texte = normaliserTexte(
    retirer(decoderEntites(htmlVersTexte(sansCitation))),
  );
  let marqueur = marqueurHtml;

  // 3. Repli textuel : certains clients n'émettent aucun conteneur
  //    reconnaissable et se contentent d'un en-tête « De : … ».
  if (!marqueur) {
    const coupeTexte = couperCitationTexte(texte);
    if (coupeTexte.marqueur) {
      texte = normaliserTexte(coupeTexte.texte);
      marqueur = coupeTexte.marqueur;
    }
  }

  return {
    texte,
    texteAvecCitation: texteComplet,
    citationRetiree: marqueur !== null,
    marqueurCitation: marqueur,
    blocsMasques: blocs,
    invisiblesRetires,
    format: "html",
  };
}

module.exports = {
  convertirCorps,
  // Exportés pour les tests et le débogage
  _interne: {
    decoderEntites,
    supprimerBlocsMasques,
    couperCitationHtml,
    couperCitationTexte,
    htmlVersTexte,
    normaliserTexte,
  },
};
