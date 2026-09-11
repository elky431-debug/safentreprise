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
export const MARQUEUR_TEXTE_DEBUT =
  "========== SAFENTREPRISE — AVERTISSEMENT ==========";
/**
 * Le marqueur de fin sert AUSSI de séparation avec le message d'origine.
 * Sans lui, l'avertissement et le mail se confondaient en un seul bloc de
 * texte et le lecteur ne voyait pas où commençait quoi.
 */
export const MARQUEUR_TEXTE_FIN =
  "===== SAFENTREPRISE — MESSAGE D'ORIGINE CI-DESSOUS =====";

/** Au-delà, on coupe : un corps texte se lit mal en lignes trop longues. */
const LARGEUR_TEXTE = 72;

/**
 * Anciens marqueurs texte, reconnus au RETRAIT uniquement.
 *
 * Des bannières posées avec eux se trouvent déjà dans des boîtes. Cesser de
 * les reconnaître les rendrait indélébiles — on n'a aucune sauvegarde du corps
 * d'origine, la découpe est le seul moyen de les enlever.
 */
const ANCIENS_MARQUEURS_TEXTE: [string, string][] = [
  [
    "===== SAFENTREPRISE — AVERTISSEMENT =====",
    "===== SAFENTREPRISE — FIN DE L'AVERTISSEMENT =====",
  ],
];

/**
 * Le corps est-il réellement du HTML ?
 *
 * ⚠ NE PAS SE FIER AU SEUL contentType. La documentation de Graph est
 *   formelle : sans l'en-tête « Prefer: outlook.body-content-type », body est
 *   renvoyé EN HTML, même pour un message nativement en texte. Un
 *   contentType valant « text » ne devrait donc jamais nous parvenir — et
 *   pourtant c'est arrivé, ce qui veut dire que ce champ ne décrit pas de
 *   façon fiable ce qu'on a réellement entre les mains.
 *
 *   On regarde donc LE CONTENU. Une balise ouvrante bien formée est un fait
 *   observable ; le contentType n'est qu'un indice, utilisé pour départager
 *   quand le contenu ne tranche pas.
 *
 *   L'erreur coûteuse est d'envoyer une bannière texte dans un corps HTML :
 *   l'avertissement s'y perd au milieu du balisage. L'inverse — du HTML dans
 *   un corps texte — affiche des balises, ce qui est visible immédiatement.
 *   En cas de doute, on penche donc vers HTML.
 */
export function corpsEstHtml(body?: {
  contentType?: string;
  content?: string;
}): boolean {
  const contenu = String(body?.content ?? "");

  // Une balise ouvrante reconnaissable, ou une entité HTML : ce sont des
  // marques que du texte brut ne porte pas.
  const balises =
    /<(?:html|body|div|p|br|table|tr|td|span|a|img|ul|li|font|b|i|strong|em|h[1-6])\b[^>]*>/i;
  if (balises.test(contenu)) return true;
  if (/&(?:nbsp|amp|lt|gt|quot|#\d+);/.test(contenu)) return true;

  // Aucune marque de HTML : c'est du texte, quoi qu'annonce le contentType.
  return false;
}

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

/**
 * ⚠ TROIS NIVEAUX, ET C'EST TOUT L'INTÉRÊT. Une bannière rouge sur chaque
 *   message finit par être ignorée — et le jour où elle compte vraiment, elle
 *   ne se distingue plus des précédentes. Le niveau faible doit être assez
 *   discret pour qu'on l'oublie, le niveau élevé assez fort pour qu'on
 *   s'arrête. Assourdir le rouge ou renforcer le gris reviendrait à casser
 *   ce que ces trois variantes existent pour produire.
 *
 * ⚠ `encadre: false` CHANGE LA STRUCTURE, PAS SEULEMENT LA COULEUR. Le niveau
 *   faible n'a ni fond, ni liseré, ni liste à puces, ni ligne de conseil :
 *   une seule ligne grise portant le motif principal. Voir
 *   `construireBanniere`.
 *
 * ⚠ LES PICTOGRAMMES SONT DES CARACTÈRES, PAS DES IMAGES. Une image distante
 *   est bloquée par défaut dans Outlook ; une image jointe alourdit chaque
 *   message. Ces trois-là sont dans le plan multilingue de base et s'affichent
 *   partout, y compris dans un client qui ne connaît aucune émoticône.
 */
const APPARENCE: Record<
  NiveauBanniere,
  {
    fond: string;
    bord: string;
    texte: string;
    titre: string;
    picto: string;
    encadre: boolean;
  }
> = {
  eleve: {
    fond: "#fdf2f2",
    bord: "#c0392b",
    texte: "#7b241c",
    titre: "Risque élevé de fraude",
    picto: "⚠",
    encadre: true,
  },
  modere: {
    fond: "#fef6ec",
    bord: "#d68910",
    texte: "#7e5109",
    titre: "Signaux suspects",
    picto: "▲",
    encadre: true,
  },
  faible: {
    // ⚠ UN FOND, DEPUIS QU'ON A VU LE RENDU DANS OUTLOOK POUR WINDOWS. La
    //   version précédente ne posait qu'un filet inférieur d'un gris très
    //   clair (#e5e7eb) sous un texte gris moyen, sans fond : dans le moteur
    //   de rendu de Word, un `border-bottom` avec `padding` sur une `<div>`
    //   est ce qui se perd le plus facilement, et il ne restait qu'une ligne
    //   de texte gris pâle en tête de message — que l'œil saute.
    //
    //   Un aplat très clair, lui, est ce que Word rend le plus fidèlement.
    //   Le niveau faible doit s'OUBLIER, pas DISPARAÎTRE : la nuance tient au
    //   fait qu'on doit l'avoir vu avant de l'oublier.
    fond: "#f1f2f4",
    bord: "#b6bcc6",
    // Assombri de #6b7280 à #4a5567 : sur un fond gris, l'ancien passait
    // sous le seuil AA. Celui-ci tient 6,7:1.
    texte: "#4a5567",
    titre: "Expéditeur inhabituel",
    picto: "ℹ",
    encadre: false,
  },
};

/**
 * Conseil de vérification, gradué.
 *
 * ⚠ LE NIVEAU FAIBLE N'EN A PAS. Un conseil d'action sur un signal ténu est
 *   précisément ce qui use l'attention : on ne demande pas à quelqu'un de
 *   décrocher son téléphone parce qu'un expéditeur est inhabituel.
 */
const CONSEIL: Partial<Record<NiveauBanniere, string>> = {
  eleve:
    "Ne donnez pas suite sans vérifier par un autre moyen — appelez votre " +
    "interlocuteur sur un numéro que vous connaissez déjà, jamais sur un " +
    "numéro indiqué dans ce message.",
  modere:
    "Si ce message vous demande un paiement ou un changement de coordonnées, " +
    "confirmez-le par un autre moyen avant d'agir.",
};

/**
 * HTML de la bannière.
 *
 * Styles en ligne uniquement : les clients de messagerie ignorent les
 * feuilles de style et une bonne partie des sélecteurs. Pas de <div>
 * imbriqué, pas de balise auto-fermante exotique, rien qui ne survive pas à
 * un passage dans Outlook mobile.
 */
/**
 * Le motif principal, ramené à ce qui tient sur une ligne.
 *
 * ⚠ SANS CETTE COUPE, LE NIVEAU FAIBLE N'EST PLUS DISCRET. Les signaux du
 *   moteur sont des phrases entières — « Le message se présente au nom de
 *   « X », qui figure à l'annuaire de l'entreprise, mais il est envoyé depuis
 *   une adresse extérieure (…) » fait deux lignes pleines. Un avertissement
 *   de deux lignes au-dessus du message n'est plus une mention en passant :
 *   il redevient un encadré, et la gradation s'efface.
 *
 * ⚠ ON COUPE SUR UN MOT, ET ON GARDE LA PHRASE ENTIÈRE SI ELLE TIENT. Le
 *   texte complet reste de toute façon lisible dans le tableau de bord, où
 *   rien n'est tronqué.
 */
const LONGUEUR_MOTIF = 84;

function resumerMotif(signal?: string): string {
  const propre = String(signal ?? "").replace(/\s+/g, " ").trim();
  if (propre.length <= LONGUEUR_MOTIF) return propre;

  const coupe = propre.slice(0, LONGUEUR_MOTIF);
  const espace = coupe.lastIndexOf(" ");
  return (espace > 40 ? coupe.slice(0, espace) : coupe).replace(/[ ,;:.]+$/, "") + "…";
}

export function construireBanniere(contenu: ContenuBanniere): string {
  const apparence = APPARENCE[contenu.niveau] ?? APPARENCE.faible;
  const police =
    "font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;";

  // ⚠ UNE SEULE <div> DANS LES TROIS CAS, Y COMPRIS LE NIVEAU FAIBLE. Le
  //   retrait de la bannière sait replier sur la balise quand Exchange a
  //   mangé les commentaires : il coupe du `<div data-safentreprise` jusqu'au
  //   PREMIER `</div>`. Une div imbriquée — ou une bannière qui n'en aurait
  //   aucune — rendrait la restauration fausse, donc un faux positif
  //   définitif. Voir l'invariant en tête de fichier.
  const ouverture = (style: string) =>
    `<div ${ATTRIBUT}="banniere" style="${style}">`;

  // ---- Niveau faible : une ligne, rien de plus ----
  //
  // Pas d'encadré, pas de liste, pas de conseil. Le motif principal tient sur
  // la même ligne que le titre : c'est ce qui permet de le lire sans s'arrêter
  // et de l'oublier aussitôt, ce qu'on veut à ce niveau-là.
  if (!apparence.encadre) {
    const motif = resumerMotif(contenu.signaux[0]);
    const corps =
      ouverture(
        // ⚠ `background-color`, PAS LE RACCOURCI `background`. Le raccourci
        //   fonctionne — l'encadré rouge s'affiche correctement dans Outlook
        //   pour Windows, c'est constaté — mais la propriété explicite est
        //   celle que le moteur de Word interprète le plus sûrement, et
        //   c'est ici qu'on en a besoin : ce niveau n'a que son fond pour se
        //   faire voir. L'encadré garde le raccourci parce qu'il marche et
        //   qu'on ne retouche pas ce qui marche.
        //
        // ⚠ CE QUI FAIT QUE ÇA RESTE DISCRET, malgré le fond : pas de liste
        //   à puces, pas de ligne de conseil, pas de titre en gras, 13 px, et
        //   des gris — jamais une couleur d'alerte. Le liseré gauche est gris
        //   moyen, pas rouge ni ambre. Ajouter l'un de ces éléments ferait
        //   du niveau faible un quatrième encadré, et les trois niveaux
        //   cesseraient de se distinguer.
        `background-color:${apparence.fond};` +
          `border-left:3px solid ${apparence.bord};` +
          `color:${apparence.texte};font-size:13px;${police}` +
          `padding:8px 12px;margin:0 0 14px 0;`,
      ) +
      `<p style="margin:0;">` +
      `${apparence.picto} Safentreprise — ${echapper(apparence.titre)}` +
      (motif ? ` · ${echapper(motif)}` : "") +
      `</p>` +
      `</div>`;

    return MARQUEUR_DEBUT + corps + MARQUEUR_FIN;
  }

  // ---- Niveaux modéré et élevé : l'encadré ----
  const signaux = contenu.signaux
    .slice(0, 5)
    .map((s) => `<li style="margin:0 0 4px 0;">${echapper(s)}</li>`)
    .join("");

  const conseil = CONSEIL[contenu.niveau];

  const corps =
    ouverture(
      `background:${apparence.fond};` +
        `border-left:4px solid ${apparence.bord};` +
        `color:${apparence.texte};` +
        `padding:12px 16px;margin:0 0 16px 0;font-size:14px;${police}`,
    ) +
    `<p style="margin:0 0 8px 0;font-weight:600;font-size:15px;">` +
    `${apparence.picto} Safentreprise — ${echapper(apparence.titre)}` +
    `</p>` +
    `<ul style="margin:0 0 8px 0;padding-left:20px;">${signaux}</ul>` +
    (conseil
      ? `<p style="margin:0;font-size:13px;">${echapper(conseil)}</p>`
      : "") +
    `</div>`;

  return MARQUEUR_DEBUT + corps + MARQUEUR_FIN;
}

/* ==========================================================================
   Conversion texte → HTML
   ========================================================================== */

/**
 * Enveloppe un corps en texte brut dans du HTML, sans rien en perdre.
 *
 * Graph accepte de faire passer un message reçu de « text » à « html » —
 * vérifié par expérience sur un locataire réel, la documentation étant muette
 * (elle affirme même que `body` n'est modifiable que sur un brouillon, ce qui
 * est faux). La conversion permet de poser partout la même bannière HTML,
 * et le corps d'origine est conservé en base, donc la restauration rend le
 * texte exact avec son contentType d'avant.
 *
 * DEUX PIÈGES, tous deux traités ici :
 *
 *   1. L'ÉCHAPPEMENT. Un mail contenant « Prix < 100 & TVA » deviendrait du
 *      balisage cassé, et « <script> » deviendrait exécutable. Tout passe par
 *      `echapper` AVANT d'ajouter la moindre balise.
 *
 *   2. LA MISE EN PAGE. En HTML, les sauts de ligne et les espaces multiples
 *      sont réduits à une seule espace : un message se retrouverait en un
 *      unique paragraphe continu. On convertit donc les sauts en <br> et les
 *      suites d'espaces en espaces insécables.
 *
 *      On n'utilise PAS « white-space: pre-wrap », plus élégant mais rendu de
 *      façon inégale par Outlook pour Windows, qui s'appuie sur le moteur de
 *      Word. <br> et &nbsp; sont compris partout.
 */
export function texteVersHtml(texte: string): string {
  const source = String(texte ?? "");

  // Fins de ligne unifiées AVANT tout : \r\n et \r isolés produiraient
  // sinon des sauts en double ou aucun saut.
  const lignes = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const corps = lignes
    .map((ligne) => {
      const echappee = echapper(ligne);
      // Les suites d'espaces s'effondrent en HTML. On garde une espace
      // ordinaire sur deux pour que le texte puisse encore se replier.
      return echappee.replace(/ {2,}/g, (suite) =>
        "&nbsp;".repeat(suite.length - 1) + " ",
      );
    })
    .join("<br>");

  return (
    `<div data-safentreprise-converti="1" ` +
    `style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;` +
    `line-height:1.5;">${corps}</div>`
  );
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

/**
 * Retire d'un signal tout ce qui pourrait passer pour un marqueur.
 *
 * Les signaux citent le nom et l'adresse de l'expéditeur — du texte qu'il
 * contrôle. Un marqueur glissé là découperait la bannière au mauvais endroit
 * et la restauration rendrait un corps tronqué.
 */
function nettoyerSignal(signal: string): string {
  let propre = String(signal ?? "");
  const marqueurs = [
    MARQUEUR_TEXTE_DEBUT,
    MARQUEUR_TEXTE_FIN,
    ...ANCIENS_MARQUEURS_TEXTE.flat(),
  ];
  for (const m of marqueurs) propre = propre.split(m).join("");
  return propre.replace(/\s+/g, " ").trim();
}

const TITRES_TEXTE: Record<NiveauBanniere, string> = {
  eleve: "RISQUE ÉLEVÉ DE FRAUDE",
  modere: "SIGNAUX SUSPECTS",
  faible: "EXPÉDITEUR INHABITUEL",
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

  // Tout le bloc est indenté de deux espaces : dans un client qui n'affiche
  // aucune couleur ni cadre, c'est le seul moyen de faire lire l'ensemble
  // comme un encart et non comme la suite du message.
  const R = "  ";

  // ---- Niveau faible : une ligne entre les deux marqueurs ----
  //
  // ⚠ MOINS DISCRET QUE SA VERSION HTML, ET ON NE PEUT PAS FAIRE MIEUX. Les
  //   deux marqueurs sont les bornes de la découpe qui restaure le message ;
  //   en texte brut ils sont forcément visibles, et les alléger pour ce
  //   niveau-là rendrait irrécupérables les bannières déjà posées. Le repli
  //   texte ne sert de toute façon qu'aux corps que la conversion en HTML a
  //   refusés, c'est-à-dire à une minorité.
  if (contenu.niveau === "faible") {
    const motif = nettoyerSignal(contenu.signaux[0] ?? "");
    const lignes = [
      MARQUEUR_TEXTE_DEBUT,
      "",
      `${R}${titre}${motif ? ` — ${motif}` : ""}`,
      "",
      MARQUEUR_TEXTE_FIN,
    ];
    return lignes.join("\n") + "\n\n";
  }

  const lignes: string[] = [
    MARQUEUR_TEXTE_DEBUT,
    "",
    `${R}/!\\  ${titre}`,
    "",
    `${R}Ce message présente les signes suivants :`,
    "",
  ];

  contenu.signaux.slice(0, 5).forEach((signal, index) => {
    // Un signal ne doit jamais contenir un marqueur : il découperait la
    // bannière au mauvais endroit et rendrait la restauration fausse.
    const propre = nettoyerSignal(signal);
    // La continuation s'aligne sous le texte, pas sous le numéro : une puce
    // qui se poursuit dans la marge se lit comme un nouveau point.
    const [premiere, ...suite] = replier(propre, LARGEUR_TEXTE - 9, "");
    lignes.push(`${R}  ${index + 1}. ${premiere}`);
    for (const l of suite) lignes.push(`${R}     ${l}`);
    // Une ligne vide entre les signaux : collés, ils forment un pavé illisible.
    lignes.push("");
  });

  // Le conseil suit le niveau : impératif en rouge, mesuré en ambre. Voir
  // `CONSEIL`, dont ceci est la transposition en texte brut.
  lignes.push(`${R}QUE FAIRE`);
  lignes.push(
    ...replier(
      contenu.niveau === "modere"
        ? "Si ce message vous demande un paiement ou un changement de " +
            "coordonnées, confirmez-le par un autre moyen avant d'agir."
        : "Ne donnez pas suite sans vérifier par un autre moyen : appelez " +
            "votre interlocuteur sur un numéro que vous connaissez déjà, " +
            "jamais sur un numéro indiqué dans ce message.",
      LARGEUR_TEXTE - 2,
      R,
    ),
  );
  lignes.push("");
  lignes.push(MARQUEUR_TEXTE_FIN);

  // Deux lignes vides avant le message : la respiration qui manquait, et qui
  // fait partie de ce que la découpe retire.
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
function motifEntreMarqueurs(debut: string, fin: string): RegExp {
  return new RegExp(
    echapperRegex(debut) +
      "[\\s\\S]*?" +
      echapperRegex(fin) +
      "(?:\\r?\\n){0,2}",
    "g",
  );
}

// L'actuel d'abord, puis les anciens : une bannière posée hier doit rester
// retirable aujourd'hui, sans quoi elle deviendrait indélébile.
const MOTIFS_TEXTE: RegExp[] = [
  motifEntreMarqueurs(MARQUEUR_TEXTE_DEBUT, MARQUEUR_TEXTE_FIN),
  ...ANCIENS_MARQUEURS_TEXTE.map(([d, f]) => motifEntreMarqueurs(d, f)),
];

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

  for (const motif of MOTIFS_TEXTE) {
    motif.lastIndex = 0;
    if (!motif.test(source)) continue;
    motif.lastIndex = 0;
    const trouvees = source.match(motif)?.length ?? 0;
    return {
      html: source.replace(motif, ""),
      retirees: trouvees,
      methode: "marqueurs-texte",
    };
  }

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
