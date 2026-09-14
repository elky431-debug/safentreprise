/**
 * Le barème du diagnostic.
 *
 *   npm run diagnostic:test
 *
 * ⚠ CE QUE CES TESTS PROTÈGENT, C'EST LA CRÉDIBILITÉ DE L'OUTIL. Un score qui
 *   ne bouge pas avec les réponses se voit au deuxième essai, et il emporte
 *   avec lui la crédibilité du reste de la page. L'écart entre le profil
 *   vertueux et le profil négligent est donc vérifié, pas espéré.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUESTIONS,
  QUESTIONS_NOTEES,
  PLANCHER,
  PLAFOND,
  calculerScore,
  palierDuScore,
  detailler,
  horsPerimetre,
  nettoyerDomaine,
  offrePourEffectif,
  SYNTHESES,
  type Reponses,
} from "./diagnostic.ts";
import { OFFRES } from "./tarifs.ts";

/** Le meilleur profil possible sur les cinq questions notées. */
const VERTUEUX: Reponses = {
  validation: "deux-trois",
  second_canal: "toujours",
  exposition_dirigeants: "non",
  domaine_protege: "oui",
  antecedent: "non",
};

/** Le pire. */
const NEGLIGENT: Reponses = {
  validation: "toute-la-compta",
  second_canal: "non",
  exposition_dirigeants: "oui",
  domaine_protege: "non",
  antecedent: "oui-paiement",
};

const MEDIAN: Reponses = {
  validation: "une-personne",
  second_canal: "parfois",
  exposition_dirigeants: "partiellement",
  domaine_protege: "inconnu",
  antecedent: "oui-reperee",
};

test("le profil vertueux touche le plancher, le négligent le plafond", () => {
  assert.equal(calculerScore(VERTUEUX), PLANCHER);
  assert.equal(calculerScore(NEGLIGENT), PLAFOND);
});

test("l'écart entre les deux est visible, pas cosmétique", () => {
  const ecart = calculerScore(NEGLIGENT) - calculerScore(VERTUEUX);
  assert.ok(
    ecart >= 50,
    `écart de ${ecart} points seulement — un répondant qui fait tout bien doit le voir`,
  );
});

test("les trois paliers sont atteignables", () => {
  assert.equal(palierDuScore(calculerScore(VERTUEUX)), "modere");
  assert.equal(palierDuScore(calculerScore(MEDIAN)), "significatif");
  assert.equal(palierDuScore(calculerScore(NEGLIGENT)), "eleve");
});

test("améliorer une seule réponse fait toujours baisser le score", () => {
  // ⚠ SANS CETTE PROPRIÉTÉ, LE BARÈME EST INCOHÉRENT : on dirait à quelqu'un
  //   qu'une mesure le protège tout en lui montrant un score qui monte.
  const depart = calculerScore(NEGLIGENT);

  const ameliorations: Reponses[] = [
    { ...NEGLIGENT, validation: "deux-trois" },
    { ...NEGLIGENT, second_canal: "toujours" },
    { ...NEGLIGENT, exposition_dirigeants: "non" },
    { ...NEGLIGENT, domaine_protege: "oui" },
    { ...NEGLIGENT, antecedent: "non" },
  ];

  for (const profil of ameliorations) {
    assert.ok(
      calculerScore(profil) < depart,
      `une amélioration ne fait pas baisser le score : ${JSON.stringify(profil)}`,
    );
  }
});

test("le score reste dans ses bornes, même sans aucune réponse", () => {
  assert.equal(calculerScore({}), PLANCHER);
  assert.ok(calculerScore(NEGLIGENT) <= PLAFOND);
});

test("chaque réponse notée a un texte de détail", () => {
  // ⚠ UNE OPTION SANS TEXTE DISPARAÎT SILENCIEUSEMENT du détail : le score
  //   tiendrait compte d'une réponse que la page ne montrerait nulle part.
  for (const cle of QUESTIONS_NOTEES) {
    const question = QUESTIONS.find((q) => q.cle === cle);
    assert.ok(question?.options, `question ${cle} sans options`);

    for (const option of question.options) {
      const lignes = detailler({ [cle]: option.valeur });
      assert.equal(
        lignes.length,
        1,
        `pas de texte de détail pour ${cle}:${option.valeur}`,
      );
      assert.ok(lignes[0].implication.length > 40);
      assert.ok(lignes[0].reponse.length > 40);
    }
  }
});

test("toute option notée porte un poids strictement positif", () => {
  for (const cle of QUESTIONS_NOTEES) {
    for (const option of QUESTIONS.find((q) => q.cle === cle)!.options!) {
      assert.ok(
        typeof option.poids === "number" && option.poids > 0,
        `${cle}:${option.valeur} sans poids`,
      );
    }
  }
});

test("le détail est trié du plus lourd au plus léger", () => {
  const lignes = detailler(MEDIAN);
  assert.equal(lignes.length, QUESTIONS_NOTEES.length);
  for (let i = 1; i < lignes.length; i++) {
    assert.ok(lignes[i - 1].poids >= lignes[i].poids);
  }
});

test("le hors-périmètre ne se déclenche que sur une messagerie non Microsoft", () => {
  assert.equal(horsPerimetre({ messagerie: "microsoft-365" }), false);
  assert.equal(horsPerimetre({ messagerie: "google-workspace" }), true);
  assert.equal(horsPerimetre({ messagerie: "autre" }), true);
  // Non répondue : on n'affirme rien.
  assert.equal(horsPerimetre({}), false);
});

test("chaque effectif proposé mène à une offre", () => {
  const effectifs = QUESTIONS.find((q) => q.cle === "effectif")!.options!;
  for (const option of effectifs) {
    const offre = offrePourEffectif(option.valeur, OFFRES);
    assert.ok(offre, `aucune offre pour l'effectif ${option.valeur}`);
    if (option.valeur === "200+") {
      assert.equal(offre.prix, null, "au-delà de 200 : nous consulter");
    } else {
      assert.ok(offre.prix, `offre sans montant pour ${option.valeur}`);
      assert.ok(offre.prix.auditInitial > 0 && offre.prix.abonnementMensuel > 0);
    }
  }
});

test("le domaine collé depuis la barre d'adresse est ramené au domaine", () => {
  // ⚠ LE CAS QU'ON VERRA LE PLUS : quelqu'un colle l'URL de son site.
  assert.equal(nettoyerDomaine("https://www.Exemple.FR/contact"), "exemple.fr");
  assert.equal(nettoyerDomaine("http://exemple.fr"), "exemple.fr");
  assert.equal(nettoyerDomaine("  exemple.fr  "), "exemple.fr");
  assert.equal(nettoyerDomaine("exemple.fr?utm=x"), "exemple.fr");
  assert.equal(nettoyerDomaine("exemple.fr#ancre"), "exemple.fr");
  // Un sous-domaine autre que `www` est conservé : il porte de l'information.
  assert.equal(nettoyerDomaine("mail.exemple.fr"), "mail.exemple.fr");
  assert.equal(nettoyerDomaine("   "), "");
});

test("le domaine est borné à la longueur maximale d'un nom de domaine", () => {
  assert.equal(nettoyerDomaine("a".repeat(400)).length, 253);
});

test("le palier le plus bas reste ferme", () => {
  // ⚠ LE TEXTE DU PALIER BAS EST LE PLUS FACILE À AMOLLIR au fil des
  //   relectures. Il doit continuer à dire pourquoi le score ne descend pas
  //   plus, sinon le plancher devient arbitraire aux yeux du répondant.
  assert.match(SYNTHESES.modere, /aucune faille technique/);
  assert.match(SYNTHESES.modere, /urgence/);
});
