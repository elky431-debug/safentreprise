/**
 * Les huit lignes réellement arrivées en base entre le 24 août et le
 * 16 septembre 2026 servent de jeu d'essai : cinq du robot, trois humaines.
 * Un seuil qui classerait mal l'une de ces huit lignes est un mauvais seuil.
 *
 * node --experimental-strip-types --test src/lib/demo-antirobot.test.ts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  alternancesDeCasse,
  empreinteOrigine,
  origineRequete,
  signauxAutomatiques,
  telephoneSansIndicatif,
  SEUIL_ALTERNANCES,
} from "./demo-antirobot.ts";

/** Les cinq noms d'entreprise du robot, relevés en base. */
const ROBOT = [
  "qCwDYoBbSidPUTNIUMuNml",
  "ZWyAtRgrfuqDxFbjmWG",
  "AtwxvIcgqiFpwkBCqFECMWE",
  "CQEGdpSqmUeqKzKEQaGn",
  "nVcPFZDpwEhXaxBdXSzq",
];

/** Les trois saisies humaines, plus des noms d'entreprise français réels. */
const HUMAIN = [
  "jobump",
  "Etsmart",
  "fff",
  "Menuiserie Dupont",
  "BNP Paribas",
  "L'Oréal",
  "EDF",
  "Cabinet Durand & Associés",
  "SARL MARTIN",
  "IBM France",
  "SNCF Réseau",
];

test("les cinq noms du robot dépassent tous le seuil", () => {
  for (const nom of ROBOT) {
    assert.ok(
      alternancesDeCasse(nom) >= SEUIL_ALTERNANCES,
      `${nom} : ${alternancesDeCasse(nom)} alternances, attendu >= ${SEUIL_ALTERNANCES}`,
    );
  }
});

test("aucune saisie humaine n'atteint le seuil", () => {
  for (const nom of HUMAIN) {
    assert.ok(
      alternancesDeCasse(nom) < SEUIL_ALTERNANCES,
      `${nom} : ${alternancesDeCasse(nom)} alternances, attendu < ${SEUIL_ALTERNANCES}`,
    );
  }
});

test("la marge entre les deux familles est large", () => {
  const pireRobot = Math.min(...ROBOT.map(alternancesDeCasse));
  const pireHumain = Math.max(...HUMAIN.map(alternancesDeCasse));
  // 8 contre 1 sur les données observées : si cet écart se resserre un jour,
  // c'est que le robot a changé, et le seuil doit être revu sciemment.
  assert.ok(
    pireRobot - pireHumain >= 4,
    `marge trop faible : robot min ${pireRobot}, humain max ${pireHumain}`,
  );
});

test("les cinq téléphones du robot sont signalés", () => {
  for (const tel of ["9310050362", "7651311514", "7568263615", "4333087107", "2656761314"]) {
    assert.ok(telephoneSansIndicatif(tel), tel);
  }
});

test("aucun numéro joignable n'est signalé", () => {
  for (const tel of [
    "0612345678",
    "06 12 34 56 78",
    "06.12.34.56.78",
    "+33612345678",
    "+33 6 12 34 56 78",
    "0033612345678",
    "0145678901",
    "+3227890123", // Belgique : un prospect, pas un robot
    "+41229876543", // Suisse
  ]) {
    assert.ok(!telephoneSansIndicatif(tel), tel);
  }
});

test("une saisie humaine complète ne lève aucun motif", () => {
  assert.deepEqual(
    signauxAutomatiques({
      entreprise: "Menuiserie Dupont",
      telephone: "06 12 34 56 78",
      dureeSaisieMs: 45_000,
    }),
    [],
  );
});

test("une soumission du robot lève les deux motifs de contenu", () => {
  assert.deepEqual(
    signauxAutomatiques({
      entreprise: "ZWyAtRgrfuqDxFbjmWG",
      telephone: "7651311514",
      dureeSaisieMs: 800,
    }),
    ["casse_alternee", "telephone_sans_indicatif", "saisie_instantanee"],
  );
});

test("une durée absente ou aberrante ne lève pas le motif de vitesse", () => {
  for (const duree of [undefined, null, -1, 3_000, 90_000]) {
    assert.ok(
      !signauxAutomatiques({
        entreprise: "Menuiserie Dupont",
        telephone: "0612345678",
        dureeSaisieMs: duree,
      }).includes("saisie_instantanee"),
      `durée ${duree}`,
    );
  }
});

test("l'empreinte est stable, salée, et refuse de travailler sans secret", () => {
  const a = empreinteOrigine("203.0.113.7", "sel-de-test");
  const b = empreinteOrigine("203.0.113.7", "sel-de-test");
  const c = empreinteOrigine("203.0.113.7", "un-autre-sel");

  assert.equal(a, b, "même adresse et même sel doivent donner la même empreinte");
  assert.notEqual(a, c, "changer le sel doit changer l'empreinte");
  assert.ok(a && !a.includes("203.0.113.7"), "l'adresse ne doit pas survivre");

  // Sans secret, on préfère perdre le compteur plutôt que stocker un hachage
  // public, qui se renverse par force brute sur l'espace IPv4.
  assert.equal(empreinteOrigine("203.0.113.7", undefined), null);
  assert.equal(empreinteOrigine("203.0.113.7", "   "), null);
  assert.equal(empreinteOrigine(null, "sel-de-test"), null);
});

test("l'en-tête Netlify est préféré, et celui qui répond est nommé", () => {
  const netlify = origineRequete(
    new Headers({
      "x-nf-client-connection-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    }),
  );
  assert.deepEqual(netlify, { ip: "203.0.113.7", entete: "x-nf-client-connection-ip" });

  // Repli, et seule la PREMIÈRE adresse de la liste est le client.
  const repli = origineRequete(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }));
  assert.deepEqual(repli, { ip: "198.51.100.1", entete: "x-forwarded-for" });

  // Aucun en-tête : la route doit pouvoir le journaliser, pas le deviner.
  assert.deepEqual(origineRequete(new Headers()), { ip: null, entete: null });
});
