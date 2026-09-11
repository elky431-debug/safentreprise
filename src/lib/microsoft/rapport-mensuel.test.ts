/**
 * Ce que ces essais protègent.
 *
 * Le rapport est agrégé : la promesse « aucun objet, aucun corps, aucune
 * adresse d'expéditeur » tient au fait que ces champs n'existent nulle part
 * dans la chaîne. Un essai le vérifie sur la sortie, au cas où l'un d'eux
 * réapparaîtrait.
 *
 * Le reste porte sur ce qui se casse sans bruit : le mois calculé dans le
 * mauvais fuseau, le total annoncé de travers, le nom d'une société qui
 * contient un chevron.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deMois,
  echapper,
  htmlRapport,
  moisSeul,
  nomDuMois,
  rapportFictif,
  rapportFictifCalme,
  sujetRapport,
  synthese,
  texteRapport,
  variation,
  type ContexteRapport,
  type DonneesRapport,
} from "./rapport-mensuel-html.ts";

const C: ContexteRapport = {
  telephone: "06 37 11 40 68",
  email: "contact@safentreprise.com",
  lienMenaces: "https://exemple.test/menaces",
};

/* ==========================================================================
   Le mois, et le piège du fuseau
   ========================================================================== */

test("le mois est lu en UTC, jamais décalé au mois précédent", () => {
  // « 2026-08-01 » est minuit UTC. Formaté à Paris (UTC+2 en été), ce serait
  // le 31 juillet 22 h — et le rapport d'août s'intitulerait « juillet ».
  assert.equal(nomDuMois("2026-08-01"), "août 2026");
  assert.equal(moisSeul("2026-08-01"), "août");
  // Janvier : le décalage jouerait dans l'autre sens (décembre de l'an passé).
  assert.equal(nomDuMois("2026-01-01"), "janvier 2026");
});

test("l'élision suit la voyelle, pas une liste", () => {
  assert.equal(deMois("2026-08-01"), "d'août");
  assert.equal(deMois("2026-04-01"), "d'avril");
  assert.equal(deMois("2026-10-01"), "d'octobre");
  assert.equal(deMois("2026-09-01"), "de septembre");
  assert.equal(deMois("2026-03-01"), "de mars");
});

test("une date illisible ne produit pas « Invalid Date »", () => {
  assert.equal(nomDuMois("n'importe quoi"), "le mois écoulé");
  assert.equal(moisSeul(""), "ce mois-ci");
});

/* ==========================================================================
   La phrase de synthèse : trois cas, trois phrases
   ========================================================================== */

function avec(alertes: DonneesRapport["alertes"]): DonneesRapport {
  return { ...rapportFictif(), alertes };
}

test("des alertes élevées : la phrase les compte", () => {
  assert.equal(
    synthese(avec({ eleve: 3, modere: 0, faible: 0 })),
    "3 tentatives de fraude ont visé votre entreprise en août.",
  );
  assert.equal(
    synthese(avec({ eleve: 1, modere: 0, faible: 0 })),
    "1 tentative de fraude a visé votre entreprise en août.",
    "le singulier compte : « 1 tentatives ont visé » décrédibilise le reste",
  );
});

test("du modéré ou du faible seulement : rien de caractérisé", () => {
  const attendu =
    "Aucune tentative caractérisée ce mois-ci. La surveillance reste active.";
  assert.equal(synthese(avec({ eleve: 0, modere: 7, faible: 0 })), attendu);
  assert.equal(synthese(avec({ eleve: 0, modere: 0, faible: 2 })), attendu);
});

test("rien du tout : la phrase dit que la surveillance a tourné", () => {
  const phrase = synthese(avec({ eleve: 0, modere: 0, faible: 0 }));
  assert.equal(
    phrase,
    "Aucune tentative détectée en août. Vos boîtes ont été surveillées en continu.",
  );
  // La seconde moitié distingue « rien ne s'est passé » de « rien n'a marché ».
  assert.ok(phrase.includes("surveillées en continu"));
});

/* ==========================================================================
   Le mois vide s'envoie quand même
   ========================================================================== */

test("le mois calme produit un rapport complet, pas un message d'absence", () => {
  const html = htmlRapport(rapportFictifCalme(), C);
  assert.ok(html.includes("Aucune tentative détectée"));
  // Les chiffres y sont malgré tout : c'est la preuve que ça a tourné.
  assert.ok(html.includes("356"), "le nombre de messages analysés doit figurer");
  assert.ok(html.includes("Boîtes surveillées"));
  assert.ok(
    html.includes("résultat attendu d'une surveillance qui fonctionne"),
    "c'est la phrase qui justifie l'envoi d'un rapport vide",
  );
});

/* ==========================================================================
   Ce qui ne doit jamais sortir
   ========================================================================== */

test("ni objet, ni corps, ni adresse d'expéditeur", () => {
  // Ces trois champs n'existent PAS dans le type. On les pose quand même :
  // si quelqu'un les ajoute un jour, la sortie les reprendrait et l'essai
  // tomberait.
  const d = {
    ...rapportFictif(),
    objet: "OBJET-INTERDIT",
    corps: "CORPS-INTERDIT",
    expediteur_email: "EXPEDITEUR-INTERDIT@gmail.com",
  } as DonneesRapport & Record<string, unknown>;

  for (const sortie of [htmlRapport(d, C), texteRapport(d, C)]) {
    assert.ok(!sortie.includes("OBJET-INTERDIT"), "l'objet a fuité");
    assert.ok(!sortie.includes("CORPS-INTERDIT"), "le corps a fuité");
    assert.ok(!sortie.includes("EXPEDITEUR-INTERDIT"), "l'expéditeur a fuité");
  }
});

test("les deux sorties rappellent ce qu'elles ne contiennent pas", () => {
  const rappel = "ni l'objet, ni le contenu, ni l'adresse d'expéditeur";
  // ⚠ ON NORMALISE LES BLANCS AVANT DE CHERCHER. La version texte replie la
  //   phrase sur deux lignes et la version HTML porte un <br> : chercher la
  //   chaîne telle quelle échouerait sur une différence de mise en page, pas
  //   sur une disparition du rappel.
  const normaliser = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(normaliser(htmlRapport(rapportFictif(), C)).includes(rappel));
  assert.ok(normaliser(texteRapport(rapportFictif(), C)).includes(rappel));
});

test("l'adresse des boîtes visées, elle, figure bien", () => {
  // Elle est nécessaire : savoir quel poste est visé est ce qui permet de le
  // protéger. C'est une différence assumée avec le reste.
  const html = htmlRapport(rapportFictif(), C);
  assert.ok(html.includes("comptabilite@exemple-industrie.fr"));
});

/* ==========================================================================
   L'échappement
   ========================================================================== */

test("le nom de société et l'UPN sont échappés", () => {
  const d: DonneesRapport = {
    ...rapportFictif(),
    societe: '<img src=x onerror="alert(1)">',
    boites_visees: [{ boite: "<script>alert(2)</script>@x.fr", alertes: 1 }],
  };
  const html = htmlRapport(d, C);
  assert.ok(!html.includes("<img src=x"), "le nom de société n'est pas échappé");
  assert.ok(!html.includes("<script>"), "l'UPN n'est pas échappé");
  assert.ok(html.includes("&lt;img src=x"));
});

test("echapper couvre les cinq caractères qui comptent", () => {
  assert.equal(echapper(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
  assert.equal(echapper(null), "");
});

/* ==========================================================================
   L'évolution
   ========================================================================== */

test("la variation est un écart absolu, jamais un pourcentage", () => {
  assert.equal(variation(3, 1), "+2");
  assert.equal(variation(1, 3), "-2");
  assert.equal(variation(4, 4), "stable");
  // Un pourcentage dirait « +200 % » pour 1 → 3, ce qui dramatise trois
  // messages.
  assert.ok(!variation(3, 1).includes("%"));
});

test("sans mois précédent, le rapport le dit au lieu de comparer à zéro", () => {
  const d: DonneesRapport = { ...rapportFictif(), precedent: { existe: false } };
  for (const sortie of [htmlRapport(d, C), texteRapport(d, C)]) {
    assert.ok(sortie.includes("premier rapport"));
    // Surtout pas « +412 » : ce n'est pas une progression, c'est un démarrage.
    assert.ok(!sortie.includes("+412"));
  }
});

test("le nombre de boîtes surveillées n'est pas comparé, et le rapport l'explique", () => {
  const texte = texteRapport(rapportFictif(), C);
  assert.ok(texte.includes("l'historique n'en est pas conservé"));
});

/* ==========================================================================
   Les types de fraude
   ========================================================================== */

test("les familles à zéro ne sont pas listées", () => {
  const d: DonneesRapport = {
    ...rapportFictif(),
    types: { usurpation: 2, virement: 0, coordonnees_bancaires: 0, urgence: 1 },
  };
  const texte = texteRapport(d, C);
  assert.ok(texte.includes("Usurpation d'identité : 2"));
  assert.ok(texte.includes("Pression à l'urgence : 1"));
  assert.ok(!texte.includes("Demande de virement"));
});

test("aucun type détecté : une phrase, pas un tableau vide", () => {
  const texte = texteRapport(rapportFictifCalme(), C);
  assert.ok(texte.includes("Aucun type de fraude caractérisé"));
});

test("le rapport avertit que les types ne partitionnent pas les alertes", () => {
  // 3 + 3 + 2 + 4 = 12 types pour 3 alertes élevées : sans cette phrase, le
  // lecteur conclut à une incohérence.
  const texte = texteRapport(rapportFictif(), C);
  assert.ok(texte.includes("peut relever de plusieurs types"));
});

/* ==========================================================================
   Les boîtes visées
   ========================================================================== */

test("le pluriel des alertes suit le nombre", () => {
  const texte = texteRapport(rapportFictif(), C);
  assert.ok(texte.includes("8 alertes"));
  assert.ok(texte.includes("1 alerte\n") || texte.includes(": 1 alerte"));
});

test("aucune boîte visée : une phrase, pas une liste vide", () => {
  assert.ok(
    texteRapport(rapportFictifCalme(), C).includes("Aucune boîte n'a reçu"),
  );
});

test("une liste de boîtes absente ne fait pas planter le rendu", () => {
  const d = { ...rapportFictif(), boites_visees: undefined } as unknown as DonneesRapport;
  assert.doesNotThrow(() => htmlRapport(d, C));
  assert.doesNotThrow(() => texteRapport(d, C));
});

/* ==========================================================================
   Le sujet
   ========================================================================== */

test("le sujet nomme le mois couvert", () => {
  assert.equal(
    sujetRapport(rapportFictif()),
    "Safentreprise — rapport de surveillance, août 2026",
  );
});

/* ==========================================================================
   Le HTML lui-même
   ========================================================================== */

test("le HTML n'utilise ni flex, ni grid, ni feuille de style", () => {
  // Outlook desktop ignore les deux premiers et une bonne partie des
  // sélecteurs : la mise en page doit tenir en tableaux et styles en ligne.
  const html = htmlRapport(rapportFictif(), C);
  assert.ok(!/display:\s*flex/.test(html));
  assert.ok(!/display:\s*grid/.test(html));
  assert.ok(!/<style/.test(html));
  assert.ok(!/class=/.test(html));
});

test("le HTML ne dépasse pas 600 px et reste centré", () => {
  const html = htmlRapport(rapportFictif(), C);
  assert.ok(html.includes("max-width:600px"));
  assert.ok(html.includes('align="center"'));
});

test("le lien vers la console figure dans les deux sorties", () => {
  assert.ok(htmlRapport(rapportFictif(), C).includes(C.lienMenaces));
  assert.ok(texteRapport(rapportFictif(), C).includes(C.lienMenaces));
});
