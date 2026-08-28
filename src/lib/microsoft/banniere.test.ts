/**
 * Pose et retrait de la bannière.
 *
 * Ces tests portent sur la seule opération IRRÉVERSIBLE du produit. Un défaut
 * ici ne se rattrape pas : le corps d'origine n'est stocké nulle part, et si
 * la découpe se trompe, le mail d'un vrai fournisseur est défiguré pour de
 * bon. Le test central est donc l'aller-retour — poser puis retirer doit
 * rendre le corps d'origine AU CARACTÈRE PRÈS.
 *
 *   npm run banniere:test
 */
import {
  MARQUEUR_DEBUT,
  MARQUEUR_FIN,
  MARQUEUR_TEXTE_DEBUT,
  MARQUEUR_TEXTE_FIN,
  construireBanniere,
  construireBanniereTexte,
  poserBanniereTexte,
  contientBanniere,
  echapper,
  poserBanniere,
  retirerBanniere,
} from "./banniere.ts";

let echecs = 0;
let total = 0;

function verifier(titre: string, condition: boolean, detail = "") {
  total += 1;
  if (condition) {
    console.log(`✅ ${titre}`);
  } else {
    echecs += 1;
    console.log(`❌ ${titre}`);
    if (detail) console.log(`     ${detail}`);
  }
}

const BANNIERE = construireBanniere({
  niveau: "eleve",
  score: 100,
  signaux: [
    "Le domaine expéditeur « safentreprlse-groupe.com » imite « safentreprise ».",
    "Demande d'action sensible détectée : virement.",
  ],
});

/* ==========================================================================
   Aller-retour — le test qui compte
   ========================================================================== */

const CORPS = [
  ["fragment simple", "<p>Bonjour,</p><p>Merci de traiter ce dossier.</p>"],
  [
    "document Outlook complet",
    `<html><head><meta http-equiv="Content-Type" content="text/html"><style><!-- .MsoNormal {margin:0cm;} --></style></head><body lang="FR" style="word-wrap:break-word"><div class="WordSection1"><p class="MsoNormal">Bonjour,</p></div></body></html>`,
  ],
  ["texte nu", "Bonjour, merci de traiter ce dossier."],
  ["corps vide", ""],
  [
    "corps contenant déjà des commentaires HTML",
    "<body><!-- commentaire du client --><p>Texte</p><!--[if mso]><p>Outlook</p><![endif]--></body>",
  ],
  [
    "corps contenant des <div> imbriqués",
    "<body><div><div><div><p>Profond</p></div></div></div></body>",
  ],
  [
    "corps contenant le mot Safentreprise en clair",
    "<body><p>Cordialement, l'équipe Safentreprise</p></body>",
  ],
] as const;

console.log("\n  ALLER-RETOUR : poser puis retirer rend le corps d'origine\n");

for (const [titre, origine] of CORPS) {
  const avec = poserBanniere(origine, BANNIERE);
  const apres = retirerBanniere(avec);
  verifier(
    `${titre}`,
    apres.html === origine,
    `attendu : ${JSON.stringify(origine.slice(0, 80))}\n     obtenu : ${JSON.stringify(apres.html.slice(0, 80))}`,
  );
}

/* ==========================================================================
   Repli si Exchange retire les commentaires
   ========================================================================== */

console.log("\n  REPLI : si Exchange mange les commentaires HTML\n");

for (const [titre, origine] of CORPS) {
  const avec = poserBanniere(origine, BANNIERE);
  // On simule le nettoyage : les marqueurs disparaissent, la <div> reste.
  const nettoye = avec
    .split(MARQUEUR_DEBUT).join("")
    .split(MARQUEUR_FIN).join("");

  const apres = retirerBanniere(nettoye);
  verifier(
    `${titre} — retrait par l'attribut`,
    apres.html === origine && apres.methode === "attribut",
    `méthode : ${apres.methode}\n     obtenu : ${JSON.stringify(apres.html.slice(0, 80))}`,
  );
}

/* ==========================================================================
   Idempotence
   ========================================================================== */

console.log("\n  IDEMPOTENCE : poser deux fois revient à poser une fois\n");

const origine = "<body><p>Bonjour</p></body>";
const une = poserBanniere(origine, BANNIERE);
const deux = poserBanniere(une, BANNIERE);
verifier("deuxième pose n'empile pas", une === deux);
verifier("retrait rend bien l'origine après deux poses", retirerBanniere(deux).html === origine);

const trois = poserBanniere(deux, construireBanniere({
  niveau: "modere", score: 55, signaux: ["Autre signal"],
}));
verifier(
  "une bannière de niveau différent REMPLACE l'ancienne",
  retirerBanniere(trois).html === origine && trois.includes("Message suspect") &&
    !trois.includes("Risque élevé"),
);

/* ==========================================================================
   Détection
   ========================================================================== */

console.log("\n  DÉTECTION\n");

verifier("contientBanniere : vrai après pose", contientBanniere(une));
verifier("contientBanniere : faux sur un corps ordinaire", !contientBanniere(origine));
verifier(
  "contientBanniere : faux sur un corps citant Safentreprise",
  !contientBanniere("<p>Cordialement, Safentreprise</p>"),
);

/* ==========================================================================
   Échappement — l'expéditeur contrôle ce texte
   ========================================================================== */

console.log("\n  ÉCHAPPEMENT : les signaux citent du texte de l'attaquant\n");

const hostile = construireBanniere({
  niveau: "eleve",
  score: 100,
  signaux: [
    `Le message se présente au nom de « <img src=x onerror="alert(1)"> », mais l'adresse « </div><script>vol()</script> » ne correspond pas.`,
  ],
});

verifier("aucune balise <img> injectée", !/<img/i.test(hostile));
verifier("aucune balise <script> injectée", !/<script/i.test(hostile));
verifier("le </div> hostile est neutralisé", (hostile.match(/<\/div>/gi) ?? []).length === 1);
verifier(
  "l'aller-retour tient malgré la charge hostile",
  retirerBanniere(poserBanniere(origine, hostile)).html === origine,
);
verifier("echapper traite les guillemets", echapper(`a"b'c`) === "a&quot;b&#39;c");

/* ==========================================================================
   Invariant structurel
   ========================================================================== */

console.log("\n  INVARIANT : une seule <div>, aucune imbriquée\n");

for (const niveau of ["faible", "modere", "eleve"] as const) {
  const b = construireBanniere({ niveau, score: 50, signaux: ["Un signal"] });
  const ouvrantes = (b.match(/<div/gi) ?? []).length;
  const fermantes = (b.match(/<\/div>/gi) ?? []).length;
  verifier(
    `niveau ${niveau} : 1 <div> ouvrante, 1 fermante`,
    ouvrantes === 1 && fermantes === 1,
    `ouvrantes=${ouvrantes} fermantes=${fermantes}`,
  );
}

const beaucoup = construireBanniere({
  niveau: "eleve",
  score: 100,
  signaux: Array.from({ length: 20 }, (_, i) => `Signal numéro ${i}`),
});
verifier("au plus 5 signaux affichés", (beaucoup.match(/<li/g) ?? []).length === 5);

/* ==========================================================================
   Version texte brut
   ========================================================================== */

console.log("\n  TEXTE BRUT : aller-retour au caractère près\n");

const BANNIERE_TEXTE = construireBanniereTexte({
  niveau: "eleve",
  score: 85,
  signaux: [
    "Le message se présente au nom de « Yacine El Fahim », qui figure à l'annuaire de l'entreprise, mais il est envoyé depuis une adresse extérieure.",
    "Demande d'action sensible détectée : virement.",
  ],
});

const CORPS_TEXTE = [
  ["message court", "Bonjour,\n\nMerci de traiter ce dossier.\n\nYacine"],
  ["une seule ligne", "Merci de faire le virement."],
  ["corps vide", ""],
  ["fins de ligne Windows", "Bonjour,\r\n\r\nMerci de traiter.\r\n"],
  [
    "corps contenant des lignes de signes égal",
    "Bonjour,\n\n=====================================\nMa signature\n",
  ],
  ["corps contenant le mot Safentreprise", "Cordialement,\nL'équipe Safentreprise"],
] as const;

for (const [titre, origine] of CORPS_TEXTE) {
  const avec = poserBanniereTexte(origine, BANNIERE_TEXTE);
  const apres = retirerBanniere(avec);
  verifier(
    titre,
    apres.html === origine && apres.methode === "marqueurs-texte",
    `méthode : ${apres.methode}\n     attendu : ${JSON.stringify(origine.slice(0, 60))}\n     obtenu  : ${JSON.stringify(apres.html.slice(0, 60))}`,
  );
}

console.log("\n  TEXTE BRUT : aucune balise, mise en forme lisible\n");

verifier("aucune balise ouvrante", !/<[a-z/!]/i.test(BANNIERE_TEXTE));
verifier("aucune entité HTML", !/&(amp|lt|gt|quot|#39);/.test(BANNIERE_TEXTE));
verifier(
  "commence par le marqueur d'ouverture",
  BANNIERE_TEXTE.startsWith(MARQUEUR_TEXTE_DEBUT),
);
verifier(
  "le titre du niveau est présent",
  BANNIERE_TEXTE.includes("RISQUE ÉLEVÉ DE FRAUDE"),
);
verifier(
  "le conseil de vérification est présent",
  BANNIERE_TEXTE.includes("numéro que vous connaissez déjà"),
);

const lignesTrop = BANNIERE_TEXTE.split("\n").filter((l) => l.length > 80);
verifier(
  "aucune ligne au-delà de 80 caractères",
  lignesTrop.length === 0,
  lignesTrop.map((l) => `${l.length} : ${l.slice(0, 50)}…`).join("\n     "),
);

verifier(
  "la bannière est bien EN TÊTE du corps",
  poserBanniereTexte("Bonjour", BANNIERE_TEXTE).indexOf("Bonjour") >
    poserBanniereTexte("Bonjour", BANNIERE_TEXTE).indexOf(MARQUEUR_TEXTE_DEBUT),
);

console.log("\n  TEXTE BRUT : idempotence et charge hostile\n");

const origineT = "Bonjour,\n\nMerci.";
const uneT = poserBanniereTexte(origineT, BANNIERE_TEXTE);
const deuxT = poserBanniereTexte(uneT, BANNIERE_TEXTE);
verifier("deuxième pose n'empile pas", uneT === deuxT);
verifier("retrait après deux poses rend l'origine", retirerBanniere(deuxT).html === origineT);

// Un expéditeur qui glisserait nos marqueurs dans son nom découperait la
// bannière au mauvais endroit et fausserait la restauration.
const hostileT = construireBanniereTexte({
  niveau: "eleve",
  score: 100,
  signaux: [
    `Nom : « ${MARQUEUR_TEXTE_FIN} texte injecté ${MARQUEUR_TEXTE_DEBUT} »`,
  ],
});
verifier(
  "un marqueur glissé dans un signal est retiré",
  (hostileT.match(new RegExp(MARQUEUR_TEXTE_FIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length === 1,
);
verifier(
  "l'aller-retour tient malgré la charge hostile",
  retirerBanniere(poserBanniereTexte(origineT, hostileT)).html === origineT,
);

console.log("\n  Les deux formats coexistent\n");

verifier(
  "une bannière HTML se retire par les marqueurs HTML",
  retirerBanniere(poserBanniere("<p>x</p>", BANNIERE)).methode === "marqueurs",
);
verifier(
  "une bannière texte se retire par les marqueurs texte",
  retirerBanniere(poserBanniereTexte("x", BANNIERE_TEXTE)).methode === "marqueurs-texte",
);
verifier(
  "contientBanniere reconnaît la version texte",
  contientBanniere(poserBanniereTexte("x", BANNIERE_TEXTE)),
);

console.log("\n  ── Aperçu de la bannière texte ──\n");
console.log(
  BANNIERE_TEXTE.split("\n").map((l) => "  │ " + l).join("\n"),
);

console.log(
  echecs === 0
    ? `\n  ${total}/${total} vérifications conformes\n`
    : `\n  ${total - echecs}/${total} — ${echecs} échec(s)\n`,
);
process.exit(echecs === 0 ? 0 : 1);
