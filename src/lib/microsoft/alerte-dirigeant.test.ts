/**
 * Ce que ces essais protègent.
 *
 * Le premier bloc porte sur la seule promesse tenue par du code plutôt que
 * par une consigne : le dirigeant ne reçoit ni l'objet ni le contenu du
 * message frauduleux. Le type ne les porte pas, la fonction Postgres ne les
 * rend pas — mais un champ ajouté un jour de fatigue ne se verrait nulle
 * part ailleurs.
 *
 * Le second protège la garde d'expédition : un email « de » gmail.com part
 * en indésirable, donc nulle part, sans que personne s'en aperçoive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  alerteFictive,
  corpsAlerte,
  corpsResume,
  expediteurLisible,
  objetAlerte,
  objetResume,
  type ContexteTexte,
  type ResumeANotifier,
} from "./alerte-dirigeant-texte.ts";
import { expediteurVerifie, erreurExpediteur } from "../send/expediteur.ts";

const C: ContexteTexte = {
  telephone: "06 37 11 40 68",
  email: "contact@safentreprise.com",
  lienMenaces: "https://exemple.test/menaces",
};

/* ==========================================================================
   Ce qui ne doit jamais sortir
   ========================================================================== */

test("le corps ne contient ni objet ni contenu du message frauduleux", () => {
  // On fabrique une alerte dont chaque champ porte une chaîne repérable, puis
  // on vérifie qu'aucune de celles qui n'ont rien à sortir n'apparaît.
  const a = {
    ...alerteFictive(),
    // Ces deux-là n'existent PAS dans le type. On les pose quand même : si
    // quelqu'un les ajoute un jour, la sortie les reprendra et l'essai tombe.
    objet: "OBJET-INTERDIT-Virement urgent dossier Mercier",
    corps: "CORPS-INTERDIT-Bonjour, merci de virer 48 000 € avant 17 h",
  } as ReturnType<typeof alerteFictive> & Record<string, unknown>;

  const texte = corpsAlerte(a, C);

  assert.ok(!texte.includes("OBJET-INTERDIT"), "l'objet du message a fuité");
  assert.ok(!texte.includes("CORPS-INTERDIT"), "le corps du message a fuité");
});

test("le résumé ne déroule ni motif ni objet", () => {
  const r: ResumeANotifier = {
    company_id: "c1",
    nombre: 3,
    depuis: "2026-09-11T06:30:00Z",
    lignes: [
      {
        analyse_at: "2026-09-11T06:30:00Z",
        boite: "compta@client.fr",
        expediteur_nom: "Marc Delaunay",
        expediteur_email: "m.delaunay@gmail.com",
        score: 92,
      },
      {
        analyse_at: "2026-09-11T07:10:00Z",
        boite: "compta@client.fr",
        expediteur_nom: "Marc Delaunay",
        expediteur_email: "marc.delaunay@outlook.com",
        score: 88,
      },
      {
        analyse_at: "2026-09-11T07:40:00Z",
        boite: "direction@client.fr",
        expediteur_nom: null,
        expediteur_email: "compta@fournisseur-bis.com",
        score: 85,
      },
    ],
  };

  const texte = corpsResume(r, C);

  assert.ok(texte.includes("3 tentatives"));
  assert.ok(texte.includes("Le détail :"), "liste complète, donc pas de « plus récentes »");
  assert.ok(texte.includes("m.delaunay@gmail.com"));
  // Aucun motif : c'est ce qui distingue le résumé de l'alerte détaillée.
  assert.ok(!texte.includes("Ce qui a déclenché"));
  assert.ok(!texte.includes("annuaire de l'entreprise"));
});

/* ==========================================================================
   Le total reste exact quand la liste est tronquée
   ========================================================================== */

test("le résumé annonce le vrai total même avec une liste plafonnée", () => {
  const lignes = Array.from({ length: 20 }, (_, i) => ({
    analyse_at: `2026-09-11T0${i % 9}:00:00Z`,
    boite: "compta@client.fr",
    expediteur_nom: "X",
    expediteur_email: "x@gmail.com",
    score: 90,
  }));

  const texte = corpsResume(
    { company_id: "c1", nombre: 57, depuis: "2026-09-11T00:00:00Z", lignes },
    C,
  );

  assert.ok(texte.startsWith("57 tentatives"), "le total doit être celui de la base");
  assert.ok(
    texte.includes("Les 20 plus récentes :"),
    "la troncature doit être annoncée, pas dissimulée",
  );
  assert.equal(objetResume(57), "Safentreprise — 57 tentatives de fraude détectées");
});

test("un résumé d'une seule alerte reprend l'objet au singulier", () => {
  assert.equal(objetResume(1), objetAlerte());
});

/* ==========================================================================
   L'écart nom affiché / adresse réelle
   ========================================================================== */

test("l'expéditeur montre toujours le nom ET l'adresse", () => {
  assert.equal(
    expediteurLisible("Marc Delaunay", "m.delaunay@gmail.com"),
    "« Marc Delaunay » <m.delaunay@gmail.com>",
  );
});

test("le nom signé n'apparaît que s'il diffère du nom affiché", () => {
  assert.equal(
    expediteurLisible("Marc Delaunay", "x@gmail.com", "Marc Delaunay"),
    "« Marc Delaunay » <x@gmail.com>",
  );
  assert.equal(
    expediteurLisible("Service Comptable", "x@gmail.com", "Marc Delaunay"),
    "« Service Comptable » <x@gmail.com>, signé « Marc Delaunay »",
  );
});

test("un expéditeur sans nom ni adresse ne produit pas une ligne vide", () => {
  assert.equal(expediteurLisible(null, null), "expéditeur inconnu");
  assert.equal(expediteurLisible(null, "x@gmail.com"), "x@gmail.com");
});

/* ==========================================================================
   Dates
   ========================================================================== */

test("les dates sont données en heure de Paris, pas en UTC", () => {
  const a = {
    ...alerteFictive(),
    // 11 septembre 2026, 07 h 30 UTC = 09 h 30 à Paris (heure d'été).
    recu_at: "2026-09-11T07:30:00Z",
  };
  const texte = corpsAlerte(a, C);
  assert.ok(texte.includes("09:30"), `heure de Paris attendue, obtenu :\n${texte}`);
});

test("une date absente ne produit pas « Invalid Date »", () => {
  const texte = corpsAlerte(
    { ...alerteFictive(), recu_at: null, analyse_at: null },
    C,
  );
  assert.ok(texte.includes("date inconnue"));
  assert.ok(!texte.includes("Invalid"));
});

/* ==========================================================================
   La garde d'expédition
   ========================================================================== */

test("la garde refuse toute adresse hors du domaine", () => {
  const avant = process.env.ESSAI_FROM;
  try {
    for (const mauvaise of [
      "alertes@gmail.com",
      "onboarding@resend.dev",
      "contact@safentreprise.com.attaquant.fr",
      "contact@safentreprise.co",
    ]) {
      process.env.ESSAI_FROM = mauvaise;
      assert.equal(
        expediteurVerifie(["ESSAI_FROM"]),
        null,
        `${mauvaise} aurait dû être refusée`,
      );
    }

    process.env.ESSAI_FROM = "alertes@safentreprise.com";
    assert.equal(expediteurVerifie(["ESSAI_FROM"]), "alertes@safentreprise.com");

    // Majuscules : le domaine se compare insensible à la casse, la valeur
    // rendue reste celle de la configuration.
    process.env.ESSAI_FROM = "Alertes@Safentreprise.COM";
    assert.equal(expediteurVerifie(["ESSAI_FROM"]), "Alertes@Safentreprise.COM");
  } finally {
    if (avant === undefined) delete process.env.ESSAI_FROM;
    else process.env.ESSAI_FROM = avant;
  }
});

test("la garde prend la première variable renseignée, dans l'ordre", () => {
  const avant = [process.env.ESSAI_A, process.env.ESSAI_B];
  try {
    delete process.env.ESSAI_A;
    process.env.ESSAI_B = "second@safentreprise.com";
    assert.equal(
      expediteurVerifie(["ESSAI_A", "ESSAI_B"]),
      "second@safentreprise.com",
    );

    process.env.ESSAI_A = "premier@safentreprise.com";
    assert.equal(
      expediteurVerifie(["ESSAI_A", "ESSAI_B"]),
      "premier@safentreprise.com",
    );

    // Une variable vide ou blanche ne compte pas comme renseignée.
    process.env.ESSAI_A = "   ";
    assert.equal(
      expediteurVerifie(["ESSAI_A", "ESSAI_B"]),
      "second@safentreprise.com",
    );
  } finally {
    if (avant[0] === undefined) delete process.env.ESSAI_A;
    else process.env.ESSAI_A = avant[0];
    if (avant[1] === undefined) delete process.env.ESSAI_B;
    else process.env.ESSAI_B = avant[1];
  }
});

test("le message d'erreur nomme les variables à poser", () => {
  const m = erreurExpediteur(["ALERTE_FROM_EMAIL", "VEILLE_FROM_EMAIL"]);
  assert.ok(m.includes("ALERTE_FROM_EMAIL"));
  assert.ok(m.includes("safentreprise.com"));
});

/* ==========================================================================
   Le pied
   ========================================================================== */

test("les deux emails rappellent ce qu'ils ne contiennent pas", () => {
  const rappel = "Ni l'objet ni le contenu des messages";
  assert.ok(corpsAlerte(alerteFictive(), C).includes(rappel));
  assert.ok(
    corpsResume(
      { company_id: "c", nombre: 2, depuis: null, lignes: [] },
      C,
    ).includes(rappel),
  );
});

test("le lien vers la console figure dans les deux emails", () => {
  assert.ok(corpsAlerte(alerteFictive(), C).includes(C.lienMenaces));
  assert.ok(
    corpsResume(
      { company_id: "c", nombre: 2, depuis: null, lignes: [] },
      C,
    ).includes(C.lienMenaces),
  );
});
