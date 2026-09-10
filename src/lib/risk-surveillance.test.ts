/**
 * Couverture de surveillance et allègement de l'axe technique.
 *
 *   npm run risque:test
 *
 * ⚠ CE QUI EST VÉRIFIÉ ICI, C'EST QUE LE POIDS N'A PAS BOUGÉ. Le remplacement
 *   de la couverture extension par la couverture des boîtes surveillées ne
 *   devait changer QUE la source du ratio : à couverture égale, l'ancien et le
 *   nouveau calcul doivent rendre exactement le même score. Le dernier test
 *   compare les deux modules pour l'établir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { estSurveillee } from "./microsoft/etat.ts";
import {
  appliquerSurveillanceAuScore,
  couvertureSurveillance,
  REDUCTION_TECHNIQUE_MAX,
} from "./risk-surveillance.ts";
import { appliquerExtensionAuScore } from "./risk-extension.ts";

/* -------------------------------------------------------------------------
   La définition d'une boîte réellement surveillée
   ------------------------------------------------------------------------- */

const BOITE = { choisie: true, actif: true, abonnee: true };

test("une boîte choisie, autorisée et abonnée est surveillée", () => {
  assert.equal(estSurveillee(BOITE), true);
});

test("une boîte choisie mais non abonnée ne compte pas", () => {
  assert.equal(estSurveillee({ ...BOITE, abonnee: false }), false);
});

test("une boîte abonnée mais inactive ne compte pas", () => {
  // L'abonnement Graph survit quelques jours à la mise hors service ; toutes
  // les fonctions d'ingestion exigent `actif`, donc rien n'est analysé.
  assert.equal(estSurveillee({ ...BOITE, actif: false }), false);
});

test("une boîte retirée par le client ne compte pas", () => {
  assert.equal(estSurveillee({ ...BOITE, choisie: false }), false);
});

/* -------------------------------------------------------------------------
   Le ratio
   ------------------------------------------------------------------------- */

test("toutes les boîtes surveillées : 100 %", () => {
  assert.equal(couvertureSurveillance(12, 12), 1);
});

test("aucune boîte surveillée : 0 %", () => {
  assert.equal(couvertureSurveillance(0, 12), 0);
});

test("couverture partielle", () => {
  assert.equal(couvertureSurveillance(6, 12), 0.5);
});

test("sans collaborateur enregistré, la couverture est nulle", () => {
  // Diviser par zéro donnerait l'infini, donc un score allégé au maximum pour
  // une société dont on ne sait rien.
  assert.equal(couvertureSurveillance(3, 0), 0);
});

test("plus de boîtes que de collaborateurs : borné à 100 %", () => {
  // compta@, factures@, contact@ — des boîtes fonctionnelles sans titulaire.
  assert.equal(couvertureSurveillance(20, 12), 1);
});

/* -------------------------------------------------------------------------
   L'effet sur le score
   ------------------------------------------------------------------------- */

const BASE = { procedures: 60, humain: 40, techniqueBase: 70 };

test("aucune boîte surveillée : l'axe technique n'est pas allégé", () => {
  const s = appliquerSurveillanceAuScore({
    ...BASE,
    boitesSurveillees: 0,
    employes: 12,
  });
  assert.equal(s.technique, BASE.techniqueBase);
  assert.equal(s.reductionTechnique, 0);
  assert.equal(s.global, s.globalSansSurveillance);
});

test("toutes les boîtes surveillées : allègement maximal", () => {
  const s = appliquerSurveillanceAuScore({
    ...BASE,
    boitesSurveillees: 12,
    employes: 12,
  });
  assert.equal(s.technique, BASE.techniqueBase - REDUCTION_TECHNIQUE_MAX);
  assert.equal(s.reductionTechnique, REDUCTION_TECHNIQUE_MAX);
  assert.ok(s.global < s.globalSansSurveillance);
});

test("un axe technique non évalué reste à zéro", () => {
  // Aucun questionnaire rempli : il n'y a rien à alléger, et l'on n'invente
  // pas un risque qui n'a pas été mesuré.
  const s = appliquerSurveillanceAuScore({
    ...BASE,
    techniqueBase: 0,
    boitesSurveillees: 12,
    employes: 12,
  });
  assert.equal(s.technique, 0);
  assert.equal(s.reductionTechnique, 0);
});

test("le plancher technique n'est jamais franchi", () => {
  const s = appliquerSurveillanceAuScore({
    ...BASE,
    techniqueBase: 20,
    boitesSurveillees: 12,
    employes: 12,
  });
  // 20 − 50 serait négatif : la surveillance réduit fortement le risque, elle
  // ne l'annule jamais.
  assert.equal(s.technique, 5);
});

/* -------------------------------------------------------------------------
   Le poids n'a pas changé
   ------------------------------------------------------------------------- */

test("à couverture égale, le nouveau calcul rend le score de l'ancien", () => {
  for (const [couverts, employes] of [
    [0, 10],
    [3, 10],
    [5, 10],
    [10, 10],
    [15, 10],
  ]) {
    const avant = appliquerExtensionAuScore({
      ...BASE,
      activations: couverts,
      employes,
    });
    const apres = appliquerSurveillanceAuScore({
      ...BASE,
      boitesSurveillees: couverts,
      employes,
    });

    assert.equal(apres.couverture, avant.couverture);
    assert.equal(apres.technique, avant.technique);
    assert.equal(apres.reductionTechnique, avant.reductionTechnique);
    assert.equal(apres.global, avant.global);
    assert.equal(apres.globalSansSurveillance, avant.globalSansExtension);
  }
});
