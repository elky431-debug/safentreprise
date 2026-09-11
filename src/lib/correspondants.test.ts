/**
 * Ce que ces essais protègent.
 *
 * Le premier bloc est le plus important : un domaine de messagerie grand
 * public enregistré comme domaine de confiance désactiverait la détection sur
 * le canal le plus utilisé par les fraudeurs, sans que rien ne le signale.
 *
 * Le reste porte sur la fidélité de l'aperçu : un client qui valide « 42
 * créés » doit obtenir 42 lignes, pas 40 et deux surprises.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  DOMAINES_GRAND_PUBLIC,
  construireApercu,
  devinerCorrespondance,
  domaineDe,
  estDomaineGrandPublic,
  normaliserNom,
  type LigneTableur,
} from "./correspondants.ts";

const COLONNES = { nom: "Fournisseur", domaine: "Email" };

function lignes(...paires: [string, string][]): LigneTableur[] {
  return paires.map(([nom, email]) => ({ Fournisseur: nom, Email: email }));
}

/* ==========================================================================
   Les trois listes de domaines grand public
   ========================================================================== */

test("la liste TypeScript est identique à celle du moteur", () => {
  // ⚠ CET ESSAI EXISTE PARCE QUE LA LISTE VIT EN TROIS EXEMPLAIRES — ici, dans
  //   le moteur, et en base. Aucun ne peut importer les autres : le moteur
  //   doit rester chargeable dans un navigateur. Les laisser diverger, c'est
  //   accepter qu'un domaine refusé à l'import soit malgré tout considéré
  //   comme ordinaire par le moteur, ou l'inverse.
  const require_ = createRequire(import.meta.url);
  (globalThis as Record<string, unknown>).self = globalThis;
  require_("./detection/detection-rules.js");
  const moteur = (globalThis as unknown as {
    self: { SafentrepriseGuard: { DOMAINES_GRAND_PUBLIC: string[] } };
  }).self.SafentrepriseGuard.DOMAINES_GRAND_PUBLIC;

  assert.deepEqual(
    [...DOMAINES_GRAND_PUBLIC].sort(),
    [...moteur].sort(),
    "la liste du moteur et celle de l'import ont divergé",
  );
});

test("les messageries grand public sont reconnues, casse et espaces compris", () => {
  for (const d of ["gmail.com", "GMAIL.COM", " orange.fr ", "free.fr", "yahoo.fr"]) {
    assert.equal(estDomaineGrandPublic(d), true, `${d} aurait dû être reconnu`);
  }
  for (const d of ["delta-log.fr", "gmail.fr", "monentreprise.gmail.com"]) {
    assert.equal(estDomaineGrandPublic(d), false, `${d} n'est pas grand public`);
  }
});

test("un fournisseur sur Gmail n'entre jamais dans la liste", () => {
  const apercu = construireApercu(
    lignes(["Delta Log", "contact@gmail.com"]),
    COLONNES,
  );
  assert.equal(apercu.entrees.length, 0, "aucune entrée ne doit être créée");
  assert.equal(apercu.rejets.length, 1);
  assert.match(apercu.rejets[0].motif, /grand public/);
  assert.deepEqual(apercu.grandPublic, ["gmail.com"]);
});

test("un fournisseur avec un domaine propre ET un Gmail garde le propre", () => {
  const apercu = construireApercu(
    lignes(["Delta Log", "contact@delta-log.fr; commercial@gmail.com"]),
    COLONNES,
  );
  assert.deepEqual(apercu.entrees[0].domaines, ["delta-log.fr"]);
  assert.equal(apercu.entrees[0].ecartes.length, 1);
  assert.match(apercu.entrees[0].ecartes[0].motif, /grand public/);
});

/* ==========================================================================
   L'extraction du domaine
   ========================================================================== */

test("le domaine sort d'une adresse, d'une URL ou d'un domaine nu", () => {
  assert.equal(domaineDe("compta@delta-log.fr"), "delta-log.fr");
  assert.equal(domaineDe("delta-log.fr"), "delta-log.fr");
  assert.equal(domaineDe("https://www.delta-log.fr/contact"), "delta-log.fr");
  assert.equal(domaineDe("WWW.Delta-Log.FR"), "delta-log.fr");
  assert.equal(domaineDe("  compta@DELTA-LOG.FR  "), "delta-log.fr");
  // Un sous-domaine reste un domaine distinct : c'est au client de décider.
  assert.equal(domaineDe("facturation.delta-log.fr"), "facturation.delta-log.fr");
});

test("ce qui n'est pas un domaine est refusé plutôt que deviné", () => {
  for (const v of ["", "   ", "Delta Log", "01 40 00 00 00", "n/a", "@", "a@"]) {
    assert.equal(domaineDe(v), null, `« ${v} » ne devrait rien donner`);
  }
});

test("une adresse à plusieurs arobases prend le dernier", () => {
  // Certains exports collent le nom devant : « Delta Log <compta@delta.fr> ».
  assert.equal(domaineDe("Delta Log <compta@delta-log.fr>"), null);
  assert.equal(domaineDe("compta@@delta-log.fr"), "delta-log.fr");
});

/* ==========================================================================
   La normalisation du nom
   ========================================================================== */

test("les formes juridiques ne distinguent pas deux fois le même fournisseur", () => {
  const attendu = "delta log";
  for (const n of [
    "DELTA-LOG SARL",
    "Delta Log",
    "delta   log s.a.r.l.",
    "Déltà-Lôg S.A.S.",
    "Delta Log SAS",
  ]) {
    assert.equal(normaliserNom(n), attendu, `« ${n} »`);
  }
});

test("un nom qui N'EST QU'une forme juridique garde sa valeur", () => {
  // Sans ce repli, sa forme normalisée serait vide et se heurterait à
  // l'unicité de la première entrée venue.
  assert.equal(normaliserNom("SA"), "sa");
  assert.equal(normaliserNom("Co"), "co");
});

test("une forme juridique à l'intérieur d'un mot n'est pas retirée", () => {
  assert.equal(normaliserNom("Sanofi"), "sanofi");
  assert.equal(normaliserNom("Cointreau"), "cointreau");
  assert.equal(normaliserNom("Incendie Services"), "incendie services");
});

/* ==========================================================================
   L'aperçu
   ========================================================================== */

test("le même fournisseur sur plusieurs lignes ne fait qu'une entrée", () => {
  // Le cas ordinaire d'un export comptable : une ligne par facture.
  const apercu = construireApercu(
    lignes(
      ["Delta Log SARL", "compta@delta-log.fr"],
      ["DELTA-LOG", "commercial@delta-log.com"],
      ["Delta Log", "compta@delta-log.fr"],
    ),
    COLONNES,
  );
  assert.equal(apercu.entrees.length, 1);
  assert.deepEqual(apercu.entrees[0].domaines, ["delta-log.fr", "delta-log.com"]);
  assert.deepEqual(apercu.entrees[0].lignes, [1, 2, 3]);
});

test("les entrées déjà déclarées sont signalées comme des fusions", () => {
  const apercu = construireApercu(
    lignes(
      ["Delta Log", "compta@delta-log.fr"],
      ["Sogefi Industrie", "compta@sogefi.fr"],
    ),
    COLONNES,
    ["DELTA-LOG SARL"],
  );
  assert.equal(apercu.fusions, 1);
  assert.equal(apercu.entrees.find((e) => e.deja)?.nom, "Delta Log");
  assert.equal(apercu.entrees.find((e) => !e.deja)?.nom, "Sogefi Industrie");
});

test("une cellule à plusieurs adresses donne plusieurs domaines", () => {
  const apercu = construireApercu(
    lignes(["Delta Log", "a@delta-log.fr ; b@delta-log.com, c@delta-log.eu"]),
    COLONNES,
  );
  assert.deepEqual(apercu.entrees[0].domaines, [
    "delta-log.fr",
    "delta-log.com",
    "delta-log.eu",
  ]);
});

test("une ligne sans nom est rejetée, une ligne vide est ignorée", () => {
  const apercu = construireApercu(
    [
      { Fournisseur: "", Email: "orphelin@nulle-part.fr" },
      { Fournisseur: "", Email: "" },
      { Fournisseur: "Delta Log", Email: "compta@delta-log.fr" },
    ],
    COLONNES,
  );
  assert.equal(apercu.entrees.length, 1);
  assert.equal(apercu.rejets.length, 1, "seule la ligne orpheline est signalée");
  assert.equal(apercu.rejets[0].motif, "nom absent");
});

test("un fournisseur sans aucun domaine exploitable est rejeté, pas créé", () => {
  const apercu = construireApercu(
    lignes(["Delta Log", "pas une adresse"]),
    COLONNES,
  );
  assert.equal(apercu.entrees.length, 0);
  assert.match(apercu.rejets[0].motif, /aucun domaine utilisable/);
});

test("le total de l'aperçu ne ment pas", () => {
  const apercu = construireApercu(
    lignes(
      ["Alpha", "a@alpha.fr"],
      ["Beta", "b@beta.fr"],
      ["Alpha", "a2@alpha.com"],
      ["Gamma", "g@gmail.com"],
      ["", "orphelin@x.fr"],
    ),
    COLONNES,
  );
  // 5 lignes lues → 2 entrées, 2 rejets (Gamma en grand public, l'orpheline).
  assert.equal(apercu.entrees.length, 2);
  assert.equal(apercu.rejets.length, 2);
  const lues = apercu.entrees.reduce((n, e) => n + e.lignes.length, 0);
  assert.equal(lues + apercu.rejets.length, 5, "toutes les lignes sont comptées");
});

test("les entrées sont triées par nom, pour un aperçu lisible", () => {
  const apercu = construireApercu(
    lignes(["Zeta", "z@zeta.fr"], ["Alpha", "a@alpha.fr"], ["Émile", "e@emile.fr"]),
    COLONNES,
  );
  assert.deepEqual(apercu.entrees.map((e) => e.nom), ["Alpha", "Émile", "Zeta"]);
});

/* ==========================================================================
   La devinette de colonnes
   ========================================================================== */

test("les en-têtes courants d'un export comptable sont reconnus", () => {
  assert.deepEqual(
    devinerCorrespondance(["Code", "Raison sociale", "Email", "Téléphone"]),
    { nom: "Raison sociale", domaine: "Email" },
  );
  assert.deepEqual(
    devinerCorrespondance(["Fournisseur", "Courriel"]),
    { nom: "Fournisseur", domaine: "Courriel" },
  );
});

test("le mot-clé le plus précis gagne, pas la colonne la plus à gauche", () => {
  // ⚠ « Code tiers » arrive avant « Raison sociale » dans le fichier, et
  //   contient le mot « tiers ». La version précédente le retenait comme nom
  //   du correspondant : les 300 lignes de l'export s'appelaient « F0012 ».
  assert.equal(
    devinerCorrespondance(["Code tiers", "Raison sociale", "Email"]).nom,
    "Raison sociale",
  );
});

test("la colonne des domaines se devine sur le CONTENU", () => {
  // ⚠ LE CAS RÉEL QUI A RÉVÉLÉ LE DÉFAUT : aucun en-tête ne contient « mail »,
  //   et la colonne « Contact » porte pourtant les adresses. La devinette
  //   proposait alors « Raison sociale » comme colonne de domaines — la même
  //   que le nom, donc un import garanti de travers.
  const entetes = ["Code tiers", "Raison sociale", "Contact", "Téléphone"];
  const lignes: LigneTableur[] = [
    { "Code tiers": "F0012", "Raison sociale": "Delta Log", Contact: "compta@delta-log.fr", "Téléphone": "01 40 11 22 33" },
    { "Code tiers": "F0031", "Raison sociale": "Sogefi", Contact: "f@sogefi.fr", "Téléphone": "04 78 00 00 00" },
    { "Code tiers": "F0044", "Raison sociale": "BRM", Contact: "contact@brm.fr", "Téléphone": "02 99 00 00 00" },
  ];
  assert.deepEqual(devinerCorrespondance(entetes, lignes), {
    nom: "Raison sociale",
    domaine: "Contact",
  });
});

test("le nom proposé n'est jamais la colonne des domaines", () => {
  // Deux colonnes seulement, toutes deux plausibles par leur en-tête.
  const lignes: LigneTableur[] = [
    { Nom: "Delta Log", "Nom du contact": "compta@delta-log.fr" },
    { Nom: "Sogefi", "Nom du contact": "f@sogefi.fr" },
  ];
  const choix = devinerCorrespondance(["Nom", "Nom du contact"], lignes);
  assert.equal(choix.domaine, "Nom du contact");
  assert.notEqual(choix.nom, choix.domaine);
});

test("une colonne à moitié vide reste reconnaissable", () => {
  // Un export comporte toujours des fournisseurs sans adresse renseignée :
  // c'est la part des cellules REMPLIES qui compte, pas des lignes.
  const lignes: LigneTableur[] = [
    { Tiers: "Delta Log", Coord: "compta@delta-log.fr" },
    { Tiers: "Sogefi", Coord: "" },
    { Tiers: "BRM", Coord: "contact@brm.fr" },
  ];
  assert.equal(devinerCorrespondance(["Tiers", "Coord"], lignes).domaine, "Coord");
});

test("des en-têtes inconnus retombent sur les deux premières colonnes", () => {
  // ⚠ C'EST UNE PROPOSITION, PAS UNE DÉCISION : l'écran affiche toujours les
  //   deux listes déroulantes pour que le client corrige.
  assert.deepEqual(devinerCorrespondance(["Col1", "Col2", "Col3"]), {
    nom: "Col1",
    domaine: "Col2",
  });
});

test("un fichier sans en-tête exploitable ne fait pas planter la devinette", () => {
  assert.deepEqual(devinerCorrespondance([]), { nom: "", domaine: "" });
});

test("les lignes écartées se relisent dans l'ordre du fichier", () => {
  // Elles sont produites en deux temps — ligne par ligne, puis par entrée une
  // fois tous les domaines connus. Sans tri, elles sortaient dans le désordre.
  const apercu = construireApercu(
    lignes(
      ["Alpha", "a@alpha.fr"],
      ["Perrin", "perrin@gmail.com"],
      ["Beta", "b@beta.fr"],
      ["Malaval", ""],
      ["", "orphelin@x.fr"],
    ),
    COLONNES,
  );
  const numeros = apercu.rejets.map((r) => r.ligne);
  assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b));
  assert.deepEqual(numeros, [2, 4, 5]);
});
