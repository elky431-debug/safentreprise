/**
 * Conversion HTML -> texte : jeu de tests.
 *
 *   node src/lib/detection/html-texte.test.js
 *
 * Les corps utilisés reproduisent ce que produisent réellement Outlook,
 * Gmail et les outils d'emailing : tableaux imbriqués, préen-têtes masqués,
 * conteneurs de citation propres à chaque client.
 *
 * La dernière section est la plus importante : elle enchaîne la conversion
 * et le moteur de détection, et vérifie que la signature est retrouvée. C'est
 * la raison d'être de ce module.
 */
"use strict";

const path = require("path");
const { convertirCorps } = require("./html-texte.js");

// Le moteur s'attache à `self` : on le lui fournit, comme le fait le serveur.
global.self = {};
require(path.join(__dirname, "detection-rules.js"));
const MOTEUR = global.self.SafentrepriseGuard;
MOTEUR.setDebug(false);

let reussis = 0;
const echecs = [];

function verifier(intitule, condition, detail) {
  if (condition) {
    console.log(`✅ ${intitule}`);
    reussis += 1;
  } else {
    console.log(`❌ ${intitule}`);
    if (detail) console.log(`   ${detail}`);
    echecs.push(intitule);
  }
}

function titre(texte) {
  console.log(`\n── ${texte} ${"─".repeat(Math.max(0, 74 - texte.length))}`);
}

/* ==========================================================================
   1. Conversion de base
   ========================================================================== */

titre("Conversion de base");

{
  const r = convertirCorps(
    "<html><body><p>Bonjour,</p><p>Peux-tu regarder&nbsp;?</p></body></html>",
  );
  verifier(
    "Les paragraphes deviennent des lignes",
    r.texte === "Bonjour,\nPeux-tu regarder ?",
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps("<div>Ligne 1<br>Ligne 2<br/>Ligne 3</div>");
  verifier(
    "Les <br> deviennent des sauts de ligne",
    r.texte === "Ligne 1\nLigne 2\nLigne 3",
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(
    "<table><tr><td>Montant</td><td>48 000 €</td></tr></table>",
  );
  verifier(
    "Les cellules d'une même ligne ne collent pas leurs mots",
    r.texte.includes("Montant 48 000 €"),
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(
    "<p>Co&ucirc;t&nbsp;: 1&nbsp;200&nbsp;&euro; &mdash; d&eacute;lai d&rsquo;un mois</p>",
  );
  verifier(
    "Les entités sont décodées",
    r.texte === "Coût : 1 200 € — délai d’un mois",
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(
    "<style>.a{color:red}</style><script>alert(1)</script><p>Visible</p>",
  );
  verifier(
    "Le contenu de <style> et <script> n'atteint pas le texte",
    r.texte === "Visible",
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps("Bonjour,\n\nMerci.\n\n\n\nYacine");
  verifier(
    "Un corps en texte brut est reconnu comme tel",
    r.format === "texte" && r.texte === "Bonjour,\n\nMerci.\n\nYacine",
    `${r.format} / ${JSON.stringify(r.texte)}`,
  );
}

/* ==========================================================================
   2. Texte masqué
   ========================================================================== */

titre("Texte masqué et caractères invisibles");

{
  const r = convertirCorps(
    '<div style="display:none;max-height:0">Préen-tête invisible</div><p>Contenu réel</p>',
  );
  verifier(
    "Un bloc display:none est retiré",
    r.texte === "Contenu réel" && r.blocsMasques === 1,
    `${JSON.stringify(r.texte)} / blocs=${r.blocsMasques}`,
  );
}

{
  const r = convertirCorps(
    '<div style="font-size:0px">Cordialement, Jean Dupont</div><p>Bonjour</p>',
  );
  verifier(
    "Une fausse signature en font-size:0 est retirée",
    !r.texte.includes("Jean Dupont"),
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(
    '<span style="color:#ffffff;background-color:#ffffff">texte blanc sur blanc</span><p>Visible</p>',
  );
  verifier(
    "Texte de la même couleur que son fond : retiré",
    !r.texte.includes("blanc sur blanc"),
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(
    '<div style="display:none"><div>imbriqué</div>masqué</div><p>Gardé</p>',
  );
  verifier(
    "L'imbrication de la même balise est gérée",
    r.texte === "Gardé",
    JSON.stringify(r.texte),
  );
}

{
  // « virement » coupé par des caractères de largeur nulle
  const r = convertirCorps("<p>Merci de faire le vi​re‌ment ce soir</p>");
  verifier(
    "Les caractères de largeur nulle sont retirés et le mot se recolle",
    r.texte.includes("virement") && r.invisiblesRetires === 2,
    `${JSON.stringify(r.texte)} / retirés=${r.invisiblesRetires}`,
  );
}

{
  const r = convertirCorps("<p>Rendez­vous demain</p>");
  verifier(
    "Le trait d'union conditionnel est retiré",
    r.texte === "Rendezvous demain",
    JSON.stringify(r.texte),
  );
}

/* ==========================================================================
   3. Fil de citation
   ========================================================================== */

titre("Découpage du fil de citation");

{
  const r = convertirCorps(`
    <div>Peux-tu valider&nbsp;?<br><br>Cordialement,<br>Yacine El Fahim</div>
    <div id="appendonsend"></div>
    <hr>
    <div id="divRplyFwdMsg">
      <b>De :</b> Marc Dubois<br><b>Envoyé :</b> lundi 3 mars<br>
      <div>Bonjour,<br>Voici le dossier.<br>Cordialement,<br>Marc Dubois</div>
    </div>`);
  verifier(
    "Outlook : coupe à appendonsend / divRplyFwdMsg",
    r.citationRetiree &&
      r.texte.includes("Yacine El Fahim") &&
      !r.texte.includes("Marc Dubois"),
    `marqueur=${r.marqueurCitation} / ${JSON.stringify(r.texte)}`,
  );
}

{
  const r = convertirCorps(`
    <div dir="ltr">D'accord, je m'en occupe.<br><br>Yacine</div>
    <div class="gmail_quote">
      <div dir="ltr" class="gmail_attr">Le lun. 3 mars 2026, Marc Dubois a écrit :</div>
      <blockquote class="gmail_quote"><div>Merci.<br>Marc Dubois</div></blockquote>
    </div>`);
  verifier(
    "Gmail : coupe à gmail_quote",
    r.citationRetiree &&
      r.texte.includes("Yacine") &&
      !r.texte.includes("Marc Dubois"),
    `marqueur=${r.marqueurCitation} / ${JSON.stringify(r.texte)}`,
  );
}

{
  const r = convertirCorps(
    "Bonjour,\n\nC'est noté.\n\nCordialement,\nYacine El Fahim\n\n" +
      "Le 3 mars 2026 à 09:12, Marc Dubois a écrit :\n" +
      "> Peux-tu confirmer ?\n> Marc Dubois",
  );
  verifier(
    "Texte brut : coupe à « … a écrit : »",
    r.citationRetiree &&
      r.texte.endsWith("Yacine El Fahim") &&
      !r.texte.includes("Marc Dubois"),
    `marqueur=${r.marqueurCitation} / ${JSON.stringify(r.texte)}`,
  );
}

{
  const r = convertirCorps(
    "Merci.\n\nYacine\n\n________________________________\n" +
      "De : Marc Dubois\nEnvoyé : lundi 3 mars 2026 09:12\nÀ : Yacine\n\nBonjour",
  );
  verifier(
    "Texte brut : coupe au séparateur Outlook",
    r.citationRetiree && !r.texte.includes("Marc Dubois"),
    `marqueur=${r.marqueurCitation} / ${JSON.stringify(r.texte)}`,
  );
}

{
  const r = convertirCorps(
    "<p>De : la part de toute l'équipe, merci pour ton aide.</p><p>Yacine</p>",
  );
  verifier(
    "« De : » sans en-tête complet ne déclenche pas de coupe",
    !r.citationRetiree && r.texte.includes("Yacine"),
    `marqueur=${r.marqueurCitation} / ${JSON.stringify(r.texte)}`,
  );
}

{
  const r = convertirCorps(
    "<div>Message seul, sans citation.<br>Yacine</div>",
  );
  verifier(
    "Sans citation, le texte complet est conservé",
    !r.citationRetiree && r.texte === "Message seul, sans citation.\nYacine",
    JSON.stringify(r.texte),
  );
}

{
  const r = convertirCorps(`
    <div>Réponse courte.<br>Yacine</div>
    <div id="appendonsend"></div>
    <div id="divRplyFwdMsg">De : Marc<br>Contenu cité</div>`);
  verifier(
    "texteAvecCitation conserve tout le fil",
    r.texteAvecCitation.includes("Contenu cité") &&
      !r.texte.includes("Contenu cité"),
    JSON.stringify(r.texteAvecCitation),
  );
}

/* ==========================================================================
   4. Le vrai objectif : le moteur retrouve-t-il la signature ?
   ========================================================================== */

titre("Bout en bout : conversion puis détection");

/** Corps HTML tel qu'en produirait Outlook pour une arnaque au président. */
const FRAUDE_OUTLOOK = `<html><head><style>.x{color:red}</style></head><body>
<div style="display:none;max-height:0">Confirmez votre virement</div>
<div class="WordSection1">
<p class="MsoNormal">Bonjour,<o:p></o:p></p>
<p class="MsoNormal">Peux-tu proc&eacute;der au vi&#8203;rement de 48&nbsp;000&nbsp;&euro;
aujourd&rsquo;hui&nbsp;? C&rsquo;est confidentiel.<o:p></o:p></p>
<p class="MsoNormal">Cordialement,<o:p></o:p></p>
<p class="MsoNormal">Yacine El Fahim<o:p></o:p></p>
<p class="MsoNormal">Pr&eacute;sident<o:p></o:p></p>
</div>
<div id="appendonsend"></div>
<div id="divRplyFwdMsg">
<b>De :</b> Comptabilit&eacute;<br><b>Envoy&eacute; :</b> lundi 3 mars<br>
<p>Bonjour,<br>Le rapport est pr&ecirc;t.<br>Cordialement,<br>Claire Moreau</p>
</div>
</body></html>`;

{
  const r = convertirCorps(FRAUDE_OUTLOOK);
  const signature = MOTEUR.extraireNomSignature(r.texte);

  verifier(
    "La signature est retrouvée dans un corps HTML Outlook",
    signature && signature.nom === "Yacine El Fahim",
    `obtenu : ${JSON.stringify(signature)}`,
  );

  verifier(
    "Ce n'est PAS la signature du message cité",
    !r.texte.includes("Claire Moreau"),
    JSON.stringify(r.texte.slice(-120)),
  );

  verifier(
    "Le mot-clé coupé par un caractère invisible est reconstitué",
    r.texte.includes("virement"),
    JSON.stringify(r.texte),
  );

  verifier(
    "Le préen-tête masqué n'apparaît pas",
    !r.texte.includes("Confirmez votre virement"),
    JSON.stringify(r.texte.slice(0, 80)),
  );

  const verdict = MOTEUR.analyserEmail({
    nomAffiche: "Yacine El Fahim",
    email: "direction.finance2026@gmail.com",
    objet: "Virement urgent",
    corps: r.texte,
  });

  verifier(
    "Le moteur conclut à une alerte élevée",
    verdict.alerte && verdict.niveau === "élevé",
    `niveau=${verdict.niveau} score=${verdict.score}`,
  );
}

{
  // Sans conversion, le moteur doit échouer — c'est ce qui justifie ce module.
  const signatureBrute = MOTEUR.extraireNomSignature(FRAUDE_OUTLOOK);
  verifier(
    "Sur le HTML brut, la signature n'est PAS trouvée (justifie ce module)",
    !signatureBrute || signatureBrute.nom !== "Yacine El Fahim",
    `obtenu : ${JSON.stringify(signatureBrute)}`,
  );
}

{
  // Un mail légitime ne doit pas devenir suspect à cause de la conversion.
  const legitime = convertirCorps(`<div dir="ltr">
    <p>Bonjour Yacine,</p>
    <p>Le devis est en pièce jointe.</p>
    <p>Bien à vous,<br>Claire Moreau<br>Cabinet Moreau</p></div>`);

  const verdict = MOTEUR.analyserEmail({
    nomAffiche: "Claire Moreau",
    email: "c.moreau@cabinet-moreau.fr",
    objet: "Devis",
    corps: legitime.texte,
  });

  verifier(
    "Un mail légitime reste sans alerte après conversion",
    !verdict.alerte,
    `niveau=${verdict.niveau} score=${verdict.score}`,
  );
}

/* ==========================================================================
   5. Robustesse
   ========================================================================== */

titre("Robustesse");

{
  const cas = [
    ["chaîne vide", ""],
    ["null", null],
    ["undefined", undefined],
    ["balise jamais fermée", '<div style="display:none">sans fin'],
    ["HTML malformé", "<p><div><span>texte</p></div>"],
    ["entité inconnue", "&pasunentite; suite"],
  ];

  let toutOk = true;
  for (const [nom, entree] of cas) {
    try {
      const r = convertirCorps(entree);
      if (typeof r.texte !== "string") toutOk = false;
    } catch (erreur) {
      toutOk = false;
      console.log(`   ↳ ${nom} a levé : ${erreur.message}`);
    }
  }
  verifier("Aucune entrée dégénérée ne fait lever d'exception", toutOk);
}

{
  const gros = "<p>ligne</p>".repeat(20000);
  const debut = Date.now();
  const r = convertirCorps(gros);
  const duree = Date.now() - debut;
  verifier(
    `Un corps de ${gros.length} caractères est traité en moins de 2 s (${duree} ms)`,
    duree < 2000 && r.texte.length > 0,
  );
}

/* ==========================================================================
   Bilan
   ========================================================================== */

console.log("\n" + "─".repeat(80));
if (echecs.length === 0) {
  console.log(`\n  ${reussis}/${reussis} vérifications conformes\n`);
  process.exit(0);
}
console.log(`\n  ${echecs.length} échec(s) sur ${reussis + echecs.length}\n`);
for (const echec of echecs) console.log(`   • ${echec}`);
console.log();
process.exit(1);
