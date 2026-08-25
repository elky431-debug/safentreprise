/**
 * Fraude au fournisseur — changement de coordonnées bancaires.
 *
 * Le premier cas est celui qui a motivé ce détecteur : avant, il obtenait 0 et
 * aucune alerte. Le moteur exigeait un nom de personne ; « Comptabilité
 * DELTA-LOG » n'en est pas un, il renonçait, et le message n'était plus
 * examiné du tout.
 *
 * Les cas « aucune alerte » comptent AUTANT que les autres. Toute facture
 * légitime porte un IBAN : c'est l'annonce d'un changement qui distingue la
 * fraude de la facture, et ces cas-là le vérifient.
 *
 *   node src/lib/detection/changement-rib.test.js
 */
globalThis.self = globalThis;
require("./detection-rules.js");

const SG = globalThis.self.SafentrepriseGuard;
SG.setDebug(false);

/** IBAN valides, utilisés tels quels dans les cas ci-dessous. */
const IBAN_FR = "FR76 3000 6000 0112 3456 7890 189";
const IBAN_DE = "DE89 3704 0044 0532 0130 00";

const CAS = [
  // ————————————————————————— Alerte attendue —————————————————————————
  {
    titre: "Changement de RIB fournisseur (le cas qui échouait)",
    attendu: "modéré",
    data: {
      nomAffiche: "Comptabilité DELTA-LOG",
      email: "compta@delta-log-facturation.net",
      objet: "RE: Facture F-2024-0912 - mise à jour de nos coordonnées bancaires",
      corps:
        "Bonjour,\n\n" +
        "Suite à un changement d'établissement bancaire, nous vous informons " +
        "que nos coordonnées bancaires ont été modifiées. Merci de bien vouloir " +
        "mettre à jour votre base fournisseurs avant votre prochain règlement.\n\n" +
        `Nouvel IBAN : ${IBAN_FR}\n\n` +
        "Le règlement de la facture F-2024-0912 devra être effectué sur le " +
        "nouveau compte. Toute somme envoyée sur l'ancien compte ne pourra pas " +
        "nous être créditée.\n\n" +
        "Bien cordialement,\nService comptabilité\nDELTA-LOG",
    },
  },
  {
    titre: "Changement de RIB avec pression à l'urgence",
    attendu: "élevé",
    data: {
      nomAffiche: "Service Fournisseurs",
      email: "facturation@groupe-nordis-sa.com",
      objet: "URGENT - changement de banque",
      corps:
        "Bonjour,\n\n" +
        "Notre banque a changé. Merci de régler la facture en attente sur le " +
        `nouveau compte avant ce soir : ${IBAN_DE}\n\n` +
        "C'est confidentiel, merci de ne pas en parler à d'autres services.\n\n" +
        "Cordialement,\nService Fournisseurs",
    },
  },
  {
    titre: "RIB français au format classique + changement annoncé",
    attendu: "modéré",
    data: {
      nomAffiche: "Comptabilité ATELIERS MERCIER",
      email: "compta@ateliers-mercier-sarl.fr",
      objet: "Changement de RIB",
      corps:
        "Madame, Monsieur,\n\n" +
        "Nous vous informons du changement de nos coordonnées bancaires.\n" +
        "Nouveau RIB : 20041 01005 0500013M026 06\n" +
        "L'ancien compte n'est plus valable.\n\n" +
        "Cordialement,\nLe service comptable",
    },
  },

  {
    // Le cas le plus fréquent dans la fraude réelle : le corps annonce, le
    // nouveau RIB est dans le PDF joint. Sans ce chemin, ce message passe.
    titre: "Changement annoncé, coordonnées en pièce jointe (pas d'IBAN)",
    attendu: "faible",
    data: {
      nomAffiche: "Comptabilité DELTA-LOG",
      email: "compta@delta-log-facturation.net",
      objet: "RE: Facture F-2024-0912 - mise à jour de nos coordonnées bancaires",
      corps:
        "Bonjour,\n\n" +
        "Suite à un changement d'établissement bancaire, nos coordonnées " +
        "bancaires ont été modifiées. Vous trouverez notre nouveau RIB en " +
        "pièce jointe. Merci de le prendre en compte avant votre prochain " +
        "règlement.\n\n" +
        "Bien cordialement,\nService comptabilité\nDELTA-LOG",
    },
  },
  {
    titre: "Même message, expéditeur externe confirmé par le contexte",
    attendu: "modéré",
    contexte: { domainesInternes: ["safentreprise.fr"] },
    data: {
      nomAffiche: "Comptabilité DELTA-LOG",
      email: "compta@delta-log-facturation.net",
      objet: "Mise à jour de nos coordonnées bancaires",
      corps:
        "Bonjour,\n\n" +
        "Suite à un changement d'établissement bancaire, nos coordonnées " +
        "bancaires ont été modifiées. Notre nouveau RIB est en pièce jointe.\n\n" +
        "Bien cordialement,\nService comptabilité\nDELTA-LOG",
    },
  },
  {
    // Garde-fou anti double compte : « nouveau RIB » est DÉJÀ dans
    // DEMANDES_SENSIBLES. Le détecteur d'identité l'ayant retenu, le chemin
    // secondaire doit se taire — sinon ce message monterait à « élevé » alors
    // que le moteur le classait « modéré » depuis toujours.
    titre: "Anti double compte : identité a déjà retenu le vocabulaire bancaire",
    attendu: "modéré",
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "yacine.elfahim@gmail.com",
      objet: "Virement à passer aujourd'hui",
      corps:
        "Bonjour,\n\nMerci de procéder au virement urgent sur le nouveau RIB.\n\n" +
        "Cordialement,\nYacine El Fahim",
    },
  },

  // ——————————————————————— Aucune alerte attendue ———————————————————————
  {
    titre: "Facture ordinaire avec IBAN, sans changement annoncé",
    attendu: null,
    data: {
      nomAffiche: "Comptabilité ATELIERS MERCIER",
      email: "compta@ateliers-mercier-sarl.fr",
      objet: "Facture F-2026-0418",
      corps:
        "Madame, Monsieur,\n\n" +
        "Veuillez trouver ci-joint la facture F-2026-0418 d'un montant de " +
        "1 240,00 EUR, payable à 30 jours.\n\n" +
        `Règlement par virement : ${IBAN_FR} — BIC AGRIFRPP\n\n` +
        "Cordialement,\nLe service comptable",
    },
  },
  {
    titre: "Relance de paiement avec IBAN en pied de page",
    attendu: null,
    data: {
      nomAffiche: "Recouvrement SOGEFI",
      email: "recouvrement@sogefi-services.fr",
      objet: "Relance facture F-2026-0311 échue",
      corps:
        "Bonjour,\n\n" +
        "Sauf erreur de notre part, la facture F-2026-0311 reste impayée. " +
        "Merci de procéder au règlement dans les meilleurs délais.\n\n" +
        `IBAN : ${IBAN_FR}\nBIC : AGRIFRPP\nTVA : FR12404833048\n` +
        "SIRET : 40483304800022\nCommande client : 20041010050500013\n\n" +
        "Cordialement,\nService recouvrement",
    },
  },
  {
    titre: "Changement annoncé mais AUCUNE coordonnée bancaire",
    attendu: null,
    data: {
      nomAffiche: "SOGEFI Services",
      email: "contact@sogefi-services.fr",
      objet: "Mise à jour de nos coordonnées",
      corps:
        "Bonjour,\n\n" +
        "Nous déménageons : merci de mettre à jour nos coordonnées dans votre " +
        "base. Nouvelle adresse : 12 rue des Lilas, 75011 Paris.\n\n" +
        "Cordialement,\nSOGEFI Services",
    },
  },
  {
    titre: "Numéros longs (SIRET, TVA, commande) sans aucun IBAN valide",
    attendu: null,
    data: {
      nomAffiche: "Service achats",
      email: "achats@fournisseur-industriel.fr",
      objet: "Nouveau compte client - changement de références",
      corps:
        "Bonjour,\n\n" +
        "Votre nouveau compte client est le 40483304800022. L'ancien compte " +
        "12345678901234567890123 n'est plus valable.\n\n" +
        "Cordialement,\nService achats",
    },
  },
  // ————————————————————————————————————————————————————————————————————————
  // ⚠ CAS DE CARACTÉRISATION — ce cas décrit un DÉFAUT, pas un comportement
  //   souhaitable. Il est ici pour que le défaut cesse d'être invisible.
  //
  //   Une facture ordinaire, sans le moindre changement annoncé, est classée
  //   « modéré » : « ATELIERS MERCIER » est pris pour un nom de personne par
  //   reconnaitreNomDePersonne (deux mots capitalisés), l'adresse
  //   compta@ateliers-mercier-sarl.fr ne « contient » pas ce nom, et le
  //   détecteur d'identité conclut à une incohérence.
  //
  //   VÉRIFIÉ SUR LE MOTEUR D'ORIGINE (commit 85a6e40) : le défaut est
  //   antérieur au découpage en détecteurs et au détecteur de RIB. Il touche
  //   toute entreprise dont le nom affiché fait deux mots — soit une bonne
  //   part des fournisseurs français.
  //
  //   À corriger dans le chantier « domaine » : le nom du domaine expéditeur
  //   (ateliers-mercier-sarl.fr) contient le nom affiché, ce qui suffirait à
  //   conclure à un expéditeur cohérent. Quand ce sera fait, ce cas passera à
  //   `attendu: null` et le test échouera ici — c'est voulu.
  // ————————————————————————————————————————————————————————————————————————
  {
    titre: "⚠ DÉFAUT CONNU : facture, nom de société pris pour un nom de personne",
    attendu: "modéré",
    data: {
      nomAffiche: "ATELIERS MERCIER",
      email: "compta@ateliers-mercier-sarl.fr",
      objet: "Facture F-2026-0418",
      corps:
        "Madame, Monsieur,\n\n" +
        "Veuillez trouver ci-joint la facture F-2026-0418 d'un montant de " +
        "1 240,00 EUR, payable à 30 jours.\n\n" +
        `Règlement par virement : ${IBAN_FR} — BIC AGRIFRPP\n\n` +
        "Cordialement,\nLe service comptable",
    },
  },

  {
    titre: "Expéditeur en liste blanche (la porte globale doit primer)",
    attendu: null,
    data: {
      nomAffiche: "LinkedIn",
      email: "notifications-noreply@linkedin.com",
      objet: "Mise à jour de vos coordonnées bancaires",
      corps:
        "Vos coordonnées de facturation ont été mises à jour.\n" +
        `Nouveau compte : ${IBAN_FR}\n` +
        "L'ancien compte n'est plus utilisé.",
    },
  },
];

// ---------------------------------------------------------------------------
// Contexte : l'externalité ne s'évalue que si l'appelant la fournit.
// ---------------------------------------------------------------------------

const CAS_CONTEXTE = [
  {
    titre: "Sans contexte : pas de signal d'externalité",
    contexte: undefined,
    attenduRaisons: ["changement_coordonnees_bancaires"],
  },
  {
    titre: "Contexte : expéditeur hors des domaines de l'entreprise",
    contexte: { domainesInternes: ["safentreprise.fr"] },
    attenduRaisons: ["changement_coordonnees_bancaires", "expediteur_externe"],
  },
  {
    titre: "Contexte : domaine ajouté à la main en liste autorisée",
    contexte: {
      domainesInternes: ["safentreprise.fr"],
      domainesAutorises: ["delta-log-facturation.net"],
    },
    attenduRaisons: ["changement_coordonnees_bancaires"],
  },
];

// ---------------------------------------------------------------------------

const ICONE = { faible: "🟡", modéré: "🟠", élevé: "🔴" };
const libelle = (n) => (n ? `${ICONE[n]} ${n}` : "— aucune");
const tronquer = (t, n) =>
  String(t).length <= n ? String(t).padEnd(n) : String(t).slice(0, n - 1) + "…";

let echecs = 0;
const lignes = [];

for (const cas of CAS) {
  const r = SG.analyserEmail(cas.data, cas.contexte);
  const obtenu = r.alerte ? r.niveau : null;
  const ok = obtenu === cas.attendu;
  if (!ok) echecs += 1;
  lignes.push({
    ok,
    titre: cas.titre,
    attendu: libelle(cas.attendu),
    obtenu: libelle(obtenu),
    score: `${r.score}/100`,
    raisons: r.raisons.join(", ") || "—",
  });
}

const L = { titre: 58, niveau: 12, score: 8 };
const sep = "─".repeat(L.titre + L.niveau * 2 + L.score + 14);

console.log("\n  CHANGEMENT DE COORDONNÉES BANCAIRES — FRAUDE AU FOURNISSEUR\n");
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
    (l.ok ? "✅ " : "❌ ") +
    tronquer(l.titre, L.titre) + " " +
    tronquer(l.attendu, L.niveau) + " " +
    tronquer(l.obtenu, L.niveau) + " " +
    tronquer(l.score, L.score)
  );
  if (!l.ok) console.log("     raisons : " + l.raisons);
}
console.log(sep);

console.log("\n  Effet du contexte (mêmes données, contexte différent)\n");
for (const c of CAS_CONTEXTE) {
  const r = SG.analyserEmail(CAS[0].data, c.contexte);
  const obtenues = r.raisons.slice().sort();
  const attendues = c.attenduRaisons.slice().sort();
  const ok = JSON.stringify(obtenues) === JSON.stringify(attendues);
  if (!ok) echecs += 1;
  console.log(
    (ok ? "✅ " : "❌ ") + tronquer(c.titre, L.titre) +
    ` ${String(r.score).padStart(3)}/100  ${r.raisons.join(", ")}`
  );
  if (!ok) console.log("     attendu : " + attendues.join(", "));
}

const total = CAS.length + CAS_CONTEXTE.length;
console.log(
  echecs === 0
    ? `\n  ${total}/${total} cas conformes\n`
    : `\n  ${total - echecs}/${total} — ${echecs} échec(s)\n`
);
process.exit(echecs === 0 ? 0 : 1);
