/**
 * Les deux emails du diagnostic.
 *
 *   npm run diagnostic:test-email
 *
 * ⚠ CE QUE CES TESTS PROTÈGENT. Un email part vers un inconnu et vers ma
 *   propre boîte : les deux doivent être lisibles, et surtout aucun des deux ne
 *   doit laisser passer ce qu'un visiteur a tapé dans un champ libre. Le nom,
 *   la société et le domaine viennent d'un formulaire public.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  corpsInterne,
  echapper,
  htmlProspect,
  sujetInterne,
  sujetProspect,
  texteProspect,
  type Coordonnees,
} from "@/lib/diagnostic-email";
import { calculerScore, type Reponses } from "@/lib/diagnostic";

const REPONSES: Reponses = {
  effectif: "26-75",
  messagerie: "microsoft-365",
  validation: "une-personne",
  second_canal: "non",
  exposition_dirigeants: "oui",
  domaine_protege: "inconnu",
  antecedent: "oui-reperee",
  domaine: "acme.fr",
};

const COORD: Coordonnees = {
  prenom: "Jean",
  nom: "Dupont",
  email: "jean@acme.fr",
  entreprise: "Acme",
};

const CONTEXTE = {
  contact: "contact@safentreprise.com",
  siteUrl: "https://safentreprise.com",
};

test("le sujet interne se lit dans une liste, sans ouvrir le message", () => {
  const score = calculerScore(REPONSES);
  assert.equal(
    sujetInterne(score, REPONSES, COORD),
    `Diagnostic — ${score} % — 26 à 75 personnes — Dupont / Acme`,
  );
});

test("un diagnostic sans coordonnées le dit dans son sujet", () => {
  // ⚠ SANS CETTE MENTION, les deux cas seraient indistinguables dans une boîte
  //   et il faudrait ouvrir chaque message pour faire le tri.
  assert.match(sujetInterne(82, REPONSES, null), /sans coordonnées$/);
});

test("la fiche interne porte les sept réponses, le domaine et le contact", () => {
  const corps = corpsInterne(calculerScore(REPONSES), REPONSES, COORD);

  for (const attendu of [
    "effectif",
    "messagerie",
    "validation",
    "second_canal",
    "exposition_dirigeants",
    "domaine_protege",
    "antecedent",
    "acme.fr",
    "jean@acme.fr",
    "Jean Dupont",
    "Acme",
  ]) {
    assert.ok(corps.includes(attendu), `absent de la fiche : ${attendu}`);
  }
});

test("une question non répondue apparaît comme telle, elle ne disparaît pas", () => {
  // ⚠ L'ABSENCE EST UNE INFORMATION. Une fiche qui saute les questions non
  //   répondues laisserait croire qu'elles n'ont pas été posées.
  const corps = corpsInterne(60, { effectif: "1-25" }, null);
  assert.match(corps, /messagerie\s+: —/);
  assert.match(corps, /Aucune\. Le répondant n'a pas rempli le formulaire\./);
});

test("le hors-périmètre est signalé dans la fiche interne", () => {
  const corps = corpsInterne(70, { ...REPONSES, messagerie: "google-workspace" }, COORD);
  assert.match(corps, /HORS PÉRIMÈTRE/);
});

test("le sujet au prospect porte son score", () => {
  assert.match(sujetProspect(82), /82 \/ 100/);
});

test("l'analyse au prospect contient le détail et l'offre chiffrée", () => {
  const score = calculerScore(REPONSES);
  const html = htmlProspect(score, REPONSES, COORD, CONTEXTE);
  const texte = texteProspect(score, REPONSES, COORD, CONTEXTE);

  for (const rendu of [html, texte]) {
    assert.ok(rendu.includes("Jean"), "le prénom n'apparaît pas");
    assert.ok(rendu.includes(String(score)), "le score n'apparaît pas");
    assert.ok(
      rendu.includes("Business"),
      "l'offre déduite de l'effectif n'apparaît pas",
    );
    assert.ok(/149/.test(rendu), "le montant mensuel n'apparaît pas");
    assert.ok(/490/.test(rendu), "l'audit initial n'apparaît pas");
    assert.ok(
      rendu.includes("Vérification d’un changement de RIB"),
      "le détail des réponses n'apparaît pas",
    );
  }
});

test("le HTML échappe tout ce qui vient du formulaire", () => {
  // ⚠ LE CAS RÉEL : quelqu'un tape n'importe quoi dans « entreprise ». Sans
  //   échappement, le HTML de l'email est cassé — et le message devient un
  //   vecteur d'injection vers ma propre boîte.
  const hostile: Coordonnees = {
    prenom: "<script>alert(1)</script>",
    nom: "O'Brien",
    email: "x@y.fr",
    entreprise: "Acme & Cie <b>",
  };

  const html = htmlProspect(70, REPONSES, hostile, CONTEXTE);

  assert.ok(!html.includes("<script>"), "une balise script a survécu");
  assert.ok(html.includes("&lt;script&gt;"), "le chevron n'est pas échappé");

  // Et le HTML reste équilibré : autant d'ouvertures que de fermetures de table.
  const ouvertes = (html.match(/<table/g) ?? []).length;
  const fermees = (html.match(/<\/table>/g) ?? []).length;
  assert.equal(ouvertes, fermees, "le HTML est déséquilibré");
});

test("echapper traite les cinq caractères qui cassent du HTML", () => {
  assert.equal(
    echapper(`<a href="x">&'`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
  );
  assert.equal(echapper(null), "");
  assert.equal(echapper(undefined), "");
});

test("au-delà de 200, l'analyse dit « nous consulter » sans montant", () => {
  const grand: Reponses = { ...REPONSES, effectif: "200+" };
  const texte = texteProspect(50, grand, COORD, CONTEXTE);

  assert.match(texte, /sur mesure|consulter/i);
  assert.ok(!/\d+\s*€/.test(texte), "un montant s'affiche alors qu'il ne devrait pas");
});
