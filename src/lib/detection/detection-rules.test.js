/**
 * Safentreprise Guard — jeu de tests des règles de détection V3
 *
 * Lancement :  node tests/detection-rules.test.js
 *
 * Chaque cas décrit un email réaliste et le niveau attendu :
 *   null       → aucune bannière
 *   "faible"   → 🟡 à vérifier
 *   "modéré"   → 🟠
 *   "élevé"    → 🔴
 */
"use strict";

const path = require("path");

// Le module de règles s'attache à `window` ou `self` : on lui fournit `self`.
const contexte = {};
global.self = contexte;
require(path.join(__dirname, "detection-rules.js"));

const SG = contexte.SafentrepriseGuard;
SG.setDebug(false); // les logs sont testés séparément, on garde la sortie lisible

// ---------------------------------------------------------------------------
// Cas de test
// ---------------------------------------------------------------------------

const CAS = [
  // ——————————————————————— Aucune alerte attendue ———————————————————————
  {
    titre: "Notification LinkedIn (nom = destinataire)",
    attendu: null,
    data: {
      nomAffiche: "LinkedIn",
      email: "notifications-noreply@linkedin.com",
      objet: "Yacine El Fahim, vous avez 3 nouvelles invitations",
      corps: [
        "Bonjour Yacine El Fahim,",
        "",
        "Vous avez 3 nouvelles invitations en attente.",
        "",
        "Vous recevez cet e-mail car vous êtes inscrit à LinkedIn.",
        "Se désabonner",
      ].join("\n"),
    },
  },
  {
    titre: "Collègue depuis une adresse interne qui colle au nom",
    attendu: null,
    data: {
      nomAffiche: "Sophie Martin",
      email: "sophie.martin@societe.com",
      objet: "Compte rendu de réunion",
      corps: [
        "Bonjour,",
        "",
        "Voici le compte rendu. Le paiement de l'acompte est prévu le 30.",
        "",
        "Cordialement,",
        "Sophie Martin",
      ].join("\n"),
    },
  },
  {
    titre: "Adresse par initiales (yef@societe.com) signée « Yacine El Fahim »",
    attendu: null,
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "yef@societe.com",
      objet: "Validation du budget",
      corps: [
        "Bonjour,",
        "",
        "Merci de procéder au virement dès validation du budget.",
        "",
        "Cordialement,",
        "Yacine El Fahim",
      ].join("\n"),
    },
  },
  {
    titre: "Initiale + nom (y.elfahim@societe.com)",
    attendu: null,
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "y.elfahim@societe.com",
      objet: "Facture à régler",
      corps: "Merci de régler la facture avant vendredi.\n\nCordialement,\nYacine El Fahim",
    },
  },
  {
    titre: "Newsletter externe saluant le destinataire par son nom",
    attendu: null,
    data: {
      nomAffiche: "Equipe Facture Pro",
      email: "contact@facture-pro.io",
      objet: "Votre facture du mois",
      corps: [
        "Bonjour Yacine El Fahim,",
        "",
        "Votre facture est disponible, le paiement sera prélevé automatiquement.",
        "",
        "L'équipe Facture Pro",
      ].join("\n"),
    },
  },
  {
    titre: "Fin de message « Voir pièce jointe » (n'est pas un nom)",
    attendu: null,
    data: {
      nomAffiche: "Compta",
      email: "compta@partenaire.fr",
      objet: "Facture de janvier",
      corps: "Bonjour,\n\nMerci de procéder au paiement de la facture.\n\nVoir pièce jointe",
    },
  },
  {
    titre: "Signature tout en minuscules (trop ambiguë pour être un nom)",
    attendu: null,
    data: {
      nomAffiche: "Compta",
      email: "compta@partenaire.fr",
      objet: "Facture",
      corps: "Merci de régler la facture avant vendredi.\n\nbien noté merci",
    },
  },
  {
    titre: "Message sans aucun nom de personne (notification applicative)",
    attendu: null,
    data: {
      nomAffiche: "Support Client",
      email: "support@monoutil.io",
      objet: "Votre ticket a été mis à jour",
      corps: "Votre ticket #4412 a été mis à jour.\n\nL'équipe Support",
    },
  },
  {
    titre: "Nom de famille seul dans l'adresse (elfahim@societe.com)",
    attendu: null,
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "elfahim@societe.com",
      objet: "Point hebdo",
      corps: "On décale à jeudi.\n\nBien à vous,\nYacine El Fahim",
    },
  },

  // ————————————————————————— 🟡 Risque faible —————————————————————————
  {
    titre: "Signé un nom depuis gmail, SANS demande d'argent",
    attendu: "faible",
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "contact2024x@gmail.com",
      objet: "Question rapide",
      corps: "Peux-tu me rappeler quand tu as un moment ?\n\nCordialement,\nYacine El Fahim",
    },
  },
  {
    titre: "Adresse générique interne (direction@) signée d'un nom",
    attendu: "faible",
    data: {
      nomAffiche: "Direction",
      email: "direction@societe.com",
      objet: "Organisation de la semaine",
      corps: "Merci de me transmettre vos disponibilités.\n\nCordialement,\nYacine El Fahim",
    },
  },

  // ———————————————————————— 🟠 Risque modéré ————————————————————————
  {
    titre: "Signé un nom depuis une adresse incohérente + virement",
    attendu: "modéré",
    data: {
      nomAffiche: "Direction Générale",
      email: "dg-compta@partenaire-groupe.net",
      objet: "Règlement fournisseur",
      corps: [
        "Bonjour,",
        "",
        "Merci d'effectuer le virement sur le nouvel IBAN communiqué hier.",
        "",
        "Bien à vous,",
        "Yacine El Fahim",
      ].join("\n"),
    },
  },

  // ————————————————————————— 🔴 Risque élevé —————————————————————————
  {
    titre: "Signé un nom depuis gmail + virement urgent (arnaque au président)",
    attendu: "élevé",
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "yacine.direction.groupe@gmail.com",
      objet: "Demande urgente et confidentielle",
      corps: [
        "Bonjour,",
        "",
        "Je suis en déplacement et injoignable par téléphone.",
        "Merci de procéder au virement de 24 500 EUR sur le nouveau RIB ci-joint.",
        "Cette opération est confidentielle, n'en parlez à personne.",
        "",
        "Cordialement,",
        "Yacine El Fahim",
      ].join("\n"),
    },
  },
  {
    titre: "Adresse générique + webmail + transfert de solde en secret",
    attendu: "élevé",
    data: {
      nomAffiche: "Marc Lefevre",
      email: "compta.groupe2024@outlook.com",
      objet: "Opération à finaliser avant ce soir",
      corps: [
        "Bonjour,",
        "",
        "Merci de transférer le solde du compte vers les nouvelles coordonnées bancaires.",
        "À traiter avant ce soir, en toute discrétion.",
        "",
        "Cordialement,",
        "Marc Lefevre",
      ].join("\n"),
    },
  },

  {
    // Cas réel remonté en test terrain : le nom de famille est saisi en
    // minuscule, ce qui doit rester reconnu comme une signature.
    titre: "Signature à majuscule partielle (« Clement faussé ») + gmail",
    attendu: "élevé",
    data: {
      nomAffiche: "ELKY 780",
      email: "elky780contact@gmail.com",
      objet: "Virement urgent et confidentiel",
      corps: [
        "Bonjour il me faut un virement vite et rapide ne le dite à personne",
        "",
        "Clement faussé",
      ].join("\n"),
    },
  },

  // ————— Cas limite : l'adresse COLLE au nom, mais c'est un webmail —————
  // L'incohérence nom/adresse ne joue pas ; seuls le webmail et la demande
  // sensible pèsent. On alerte donc, mais sans monter au rouge : il peut
  // s'agir du vrai dirigeant écrivant depuis son adresse personnelle.
  {
    titre: "Adresse gmail COHÉRENTE avec le nom + virement urgent",
    attendu: "modéré",
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "yacine.elfahim@gmail.com",
      objet: "Virement à passer aujourd'hui",
      corps: [
        "Bonjour,",
        "",
        "Merci de procéder au virement urgent sur le nouveau RIB.",
        "",
        "Cordialement,",
        "Yacine El Fahim",
      ].join("\n"),
    },
  },
];

// ---------------------------------------------------------------------------
// Exécution & tableau de résultats
// ---------------------------------------------------------------------------

const ICONE = { faible: "🟡", modéré: "🟠", élevé: "🔴" };

function niveauObtenu(resultat) {
  return resultat.alerte ? resultat.niveau : null;
}

function libelle(niveau) {
  return niveau ? `${ICONE[niveau]} ${niveau}` : "— aucune";
}

function tronquer(texte, taille) {
  const t = String(texte);
  return t.length <= taille ? t.padEnd(taille) : t.slice(0, taille - 1) + "…";
}

const lignes = [];
let echecs = 0;

for (const cas of CAS) {
  const resultat = SG.analyserEmail(cas.data);
  const obtenu = niveauObtenu(resultat);
  const ok = obtenu === cas.attendu;
  if (!ok) echecs += 1;

  lignes.push({
    ok,
    titre: cas.titre,
    attendu: libelle(cas.attendu),
    obtenu: libelle(obtenu),
    score: `${resultat.score}/100`,
    signaux: resultat.raisons.join(", ") || "—",
  });
}

const L = { titre: 62, niveau: 12, score: 8 };
const sep = "─".repeat(L.titre + L.niveau * 2 + L.score + 14);

console.log("\n  SAFENTREPRISE GUARD — TESTS DE DÉTECTION (V3, principe universel)\n");
console.log(sep);
console.log(
  "  " + tronquer("CAS", L.titre) + " " +
  tronquer("ATTENDU", L.niveau) + " " +
  tronquer("OBTENU", L.niveau) + " " +
  tronquer("SCORE", L.score)
);
console.log(sep);

for (const l of lignes) {
  console.log(
    (l.ok ? "✅" : "❌") + " " +
    tronquer(l.titre, L.titre) + " " +
    tronquer(l.attendu, L.niveau) + " " +
    tronquer(l.obtenu, L.niveau) + " " +
    tronquer(l.score, L.score)
  );
  if (!l.ok) console.log("     signaux : " + l.signaux);
}

console.log(sep);
console.log(
  `\n  ${CAS.length - echecs}/${CAS.length} cas conformes` +
  (echecs ? ` — ${echecs} ÉCHEC(S)\n` : " — tous les cas passent\n")
);

process.exit(echecs ? 1 : 0);
