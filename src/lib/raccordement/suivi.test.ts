/**
 * Les règles d'affichage du suivi. `node --experimental-strip-types --test`.
 *
 * ⚠ CES RÈGLES SE TESTENT PARCE QU'ELLES SE TROMPENT SILENCIEUSEMENT. Une
 *   phase mal déduite n'affiche pas d'erreur : elle affiche une phrase
 *   plausible et fausse, et le dirigeant attend.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { phaseDe, ceQuOnAttend, minutesDePropagation, type Suivi } from "./suivi.ts";

const BASE: Suivi = {
  jeton: "a".repeat(32),
  destinataire_nom: "Paul",
  destinataire_email: "paul@presta.fr",
  adresses_demandees: ["compta@durand.fr"],
  envoye_at: "2026-09-18T09:00:00Z",
  ouvert_at: null,
  expire_at: "2026-10-02T09:00:00Z",
  termine_at: null,
  accord_donne: false,
  tenant_id: null,
  tenant_confirme_at: null,
  restriction_verifiee_at: null,
  boites_choisies: 0,
  boites_actives: 0,
  blocages_ouverts: 0,
  dernier_blocage_motif: null,
  dernier_blocage_at: null,
};

test("envoyé, pas ouvert", () => {
  assert.equal(phaseDe(BASE), "envoye");
});

test("ouvert sans accord", () => {
  assert.equal(phaseDe({ ...BASE, ouvert_at: "2026-09-18T10:00:00Z" }), "ouvert");
});

test("accord donné, périmètre vide", () => {
  assert.equal(phaseDe({ ...BASE, ouvert_at: "x", accord_donne: true }), "accord");
});

test("périmètre fixé : on attend la propagation", () => {
  const s = { ...BASE, ouvert_at: "x", accord_donne: true, boites_choisies: 3 };
  assert.equal(phaseDe(s), "restriction");
});

test("restriction constatée ET boîtes actives : actif", () => {
  const s = {
    ...BASE, ouvert_at: "x", accord_donne: true, boites_choisies: 3,
    boites_actives: 3, restriction_verifiee_at: "2026-09-18T12:00:00Z",
  };
  assert.equal(phaseDe(s), "actif");
});

test("restriction constatée mais AUCUNE boîte active : pas actif", () => {
  // ⚠ LE CAS QUI FAISAIT MENTIR L'ÉCRAN. La preuve existe, mais rien n'est
  //   surveillé : annoncer « actif » ferait croire à une protection absente.
  const s = {
    ...BASE, ouvert_at: "x", accord_donne: true, boites_choisies: 3,
    boites_actives: 0, restriction_verifiee_at: "2026-09-18T12:00:00Z",
  };
  assert.equal(phaseDe(s), "restriction");
});

test("un blocage domine même un raccordement presque fini", () => {
  const s = {
    ...BASE, ouvert_at: "x", accord_donne: true, boites_choisies: 3,
    boites_actives: 3, restriction_verifiee_at: "2026-09-18T12:00:00Z",
    blocages_ouverts: 1, dernier_blocage_motif: "script-echoue",
  };
  assert.equal(phaseDe(s), "bloque");
});

test("chaque phase dit qui doit agir", () => {
  // Aucune phrase ne doit laisser le dirigeant deviner si c'est à lui de jouer.
  for (const s of [
    BASE,
    { ...BASE, ouvert_at: "x" },
    { ...BASE, ouvert_at: "x", accord_donne: true },
    { ...BASE, ouvert_at: "x", accord_donne: true, boites_choisies: 2 },
    { ...BASE, blocages_ouverts: 1 },
  ]) {
    const phrase = ceQuOnAttend(s);
    assert.ok(phrase.length > 20, "une phrase, pas un mot");
    assert.ok(!phrase.includes("undefined"));
  }
});

test("aucun compte à rebours n'est affiché, et c'est délibéré", () => {
  // ⚠ CE TEST GARDE UNE ABSENCE, PAS UNE VALEUR. La première version calculait
  //   les minutes depuis `ouvert_at` : un informaticien qui ouvre le lien lundi
  //   et exécute le script jeudi faisait afficher « 4 320 minutes écoulées »
  //   pour une propagation d'une heure. Le jour où quelqu'un voudra rétablir un
  //   compteur, il faudra d'abord horodater l'exécution du script — et ce test
  //   échouera pour le lui rappeler.
  assert.equal(minutesDePropagation(), null);
});
