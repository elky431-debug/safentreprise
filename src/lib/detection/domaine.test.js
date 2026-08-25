/**
 * Domaine imité et identité d'annuaire usurpée.
 *
 * Ces cas fournissent un CONTEXTE — domaines de l'entreprise, annuaire — que
 * seul le serveur peut établir. Les seize cas de référence, eux, tournent sans
 * contexte : c'est ce qui garantit que le moteur nu reste inchangé.
 *
 * ⚠ Sur Outlook la bannière est IRRÉVERSIBLE. Un faux positif ne fait pas
 *   qu'agacer, il défigure définitivement le mail d'un vrai fournisseur. Les
 *   cas « aucune alerte » de ce fichier sont donc au moins aussi importants
 *   que les autres, en particulier ceux des domaines frères légitimes.
 *
 *   node src/lib/detection/domaine.test.js
 */
globalThis.self = globalThis;
require("./detection-rules.js");

const SG = globalThis.self.SafentrepriseGuard;
SG.setDebug(false);

/** Le contexte tel que le worker le construira. */
const CONTEXTE = {
  domainesInternes: ["safentreprise.fr"],
  domainesAutorises: ["mailchimp-safentreprise.com", "safentreprise-rh.com"],
  annuaire: [
    { nom: "Yacine El Fahim", email: "yacine@safentreprise.fr" },
    { nom: "Claire Nguyen", email: "claire.nguyen@safentreprise.fr" },
  ],
};

const SIGNATURE_PDG =
  "\n\nCordialement,\nYacine El Fahim\nPrésident\nSafentreprise";

const CAS = [
  // ————————————————————————— Alerte attendue —————————————————————————
  {
    titre: "Président typosquatté (le cas qui échouait)",
    attendu: "élevé",
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "y.elfahim@safentreprlse-groupe.com",
      objet: "Confidentiel - virement à traiter aujourd'hui",
      corps:
        "Bonjour,\n\nJe suis en réunion toute la journée. J'ai besoin que " +
        "vous prépariez un virement de 48 500 EUR aujourd'hui avant 16h. " +
        "Merci de me confirmer par retour de mail uniquement." +
        SIGNATURE_PDG,
    },
  },
  {
    titre: "Typosquat sans demande sensible (le fait suffit)",
    attendu: "élevé",
    data: {
      nomAffiche: "Service RH",
      email: "contact@safentreprlse.fr",
      objet: "Note d'information",
      corps: "Bonjour,\n\nMerci de consulter la note ci-jointe.\n\nLe service RH",
    },
  },
  {
    titre: "Marque reprise dans un domaine tiers non déclaré",
    attendu: "modéré",
    data: {
      nomAffiche: "Direction",
      email: "direction@safentreprise-finance.com",
      objet: "Information",
      corps: "Bonjour,\n\nMerci de prendre connaissance du document.\n\nLa direction",
    },
  },
  {
    titre: "Nom de l'annuaire depuis une adresse externe, sans demande",
    attendu: "modéré",
    data: {
      nomAffiche: "Claire Nguyen",
      email: "claire.nguyen@gmail.com",
      objet: "Question rapide",
      corps:
        "Bonjour,\n\nJe te réponds depuis mon adresse perso, je n'ai pas " +
        "accès au bureau aujourd'hui.\n\nClaire Nguyen",
    },
  },
  {
    titre: "Nom de l'annuaire, adresse externe + demande sensible → élevé",
    attendu: "élevé",
    data: {
      nomAffiche: "Claire Nguyen",
      email: "claire.nguyen.pro@gmail.com",
      objet: "Virement fournisseur",
      corps:
        "Bonjour,\n\nMerci de procéder au virement de 12 000 EUR sur le " +
        "compte indiqué en pièce jointe.\n\nClaire Nguyen",
    },
  },

  // ——————————————————————— Aucune alerte attendue ———————————————————————
  {
    titre: "Domaine de l'entreprise lui-même",
    attendu: null,
    data: {
      nomAffiche: "Yacine El Fahim",
      email: "yacine@safentreprise.fr",
      objet: "Point équipe jeudi",
      corps: "Salut,\n\nOn décale le point à jeudi 14h.\n\nYacine",
    },
  },
  {
    titre: "Sous-domaine de l'entreprise",
    attendu: null,
    data: {
      nomAffiche: "Notifications",
      email: "no-reply@mail.safentreprise.fr",
      objet: "Votre rapport hebdomadaire",
      corps: "Bonjour,\n\nVotre rapport est disponible.\n\nL'équipe",
    },
  },
  {
    titre: "Domaine frère déclaré à la main (routeur d'emailing)",
    attendu: null,
    data: {
      nomAffiche: "Safentreprise",
      email: "campagnes@mailchimp-safentreprise.com",
      objet: "Votre newsletter de septembre",
      corps: "Bonjour,\n\nDécouvrez nos actualités.\n\nL'équipe Safentreprise",
    },
  },
  {
    titre: "Fournisseur ordinaire, aucun rapport avec la marque",
    attendu: null,
    data: {
      nomAffiche: "Comptabilité ATELIERS MERCIER",
      email: "compta@ateliers-mercier-sarl.fr",
      objet: "Facture F-2026-0418",
      corps:
        "Madame, Monsieur,\n\nVeuillez trouver ci-joint la facture " +
        "F-2026-0418, payable à 30 jours.\n\nCordialement,\nLe service comptable",
    },
  },
  {
    titre: "Label court : pas de conclusion sur quatre lettres",
    attendu: null,
    contexte: { domainesInternes: ["acme.fr"] },
    data: {
      nomAffiche: "Support Acne Solutions",
      email: "support@acne.com",
      objet: "Votre commande",
      corps: "Bonjour,\n\nVotre commande est expédiée.\n\nLe support",
    },
  },
  {
    titre: "Homonyme : même prénom, patronyme différent",
    attendu: null,
    data: {
      nomAffiche: "Claire Nguyen-Martin",
      email: "c.nguyenmartin@cabinet-comptable.fr",
      objet: "Vos comptes annuels",
      corps:
        "Bonjour,\n\nVeuillez trouver le projet de comptes annuels.\n\n" +
        "Claire Nguyen-Martin",
    },
  },
  {
    titre: "Sans contexte, le détecteur de domaine se tait",
    attendu: null,
    contexte: undefined,
    data: {
      nomAffiche: "Service RH",
      email: "contact@safentreprlse.fr",
      objet: "Note d'information",
      corps: "Bonjour,\n\nMerci de consulter la note ci-jointe.\n\nLe service RH",
    },
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
  const contexte = "contexte" in cas ? cas.contexte : CONTEXTE;
  const r = SG.analyserEmail(cas.data, contexte);
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
    motif: r.motifNonAlerte,
  });
}

const L = { titre: 56, niveau: 12, score: 8 };
const sep = "─".repeat(L.titre + L.niveau * 2 + L.score + 14);

console.log("\n  DOMAINE IMITÉ ET IDENTITÉ D'ANNUAIRE\n");
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
  if (!l.ok) console.log(`     raisons : ${l.raisons}\n     motif   : ${l.motif}`);
}
console.log(sep);

console.log(
  echecs === 0
    ? `\n  ${CAS.length}/${CAS.length} cas conformes\n`
    : `\n  ${CAS.length - echecs}/${CAS.length} — ${echecs} échec(s)\n`
);
process.exit(echecs === 0 ? 0 : 1);
