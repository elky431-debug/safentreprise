/**
 * Correspondants de confiance — la détection du faux fournisseur.
 *
 * Le client déclare ses fournisseurs et leurs domaines. Un message qui se
 * présente au nom de l'un d'eux depuis un autre domaine vaut 75 points, soit
 * « élevé » à lui seul.
 *
 * ⚠ LA MOITIÉ DE CE FICHIER PORTE SUR CE QUI NE DOIT PAS DÉCLENCHER, et c'est
 *   la moitié qui compte. Sur Outlook la bannière est irréversible : une
 *   règle qui vaut 75 points d'emblée défigure définitivement le mail d'un
 *   vrai fournisseur dès qu'elle se trompe. Les cas « aucune alerte » sont
 *   donc au moins aussi importants que les autres.
 *
 *   node src/lib/detection/correspondant.test.js
 */
globalThis.self = globalThis;
require("./detection-rules.js");

const SG = globalThis.self.SafentrepriseGuard;
SG.setDebug(false);

/** Le contexte tel que `contexte_detection_graph` le construit. */
const CONTEXTE = {
  domainesInternes: ["safentreprise.fr"],
  domainesAutorises: ["facturation-partenaire.com"],
  annuaire: [{ nom: "Yacine El Fahim", email: "yacine@safentreprise.fr" }],
  correspondants: [
    { nom: "Delta-Log SARL", domaines: ["delta-log.fr", "delta-log.com"] },
    { nom: "Sogefi Industrie", domaines: ["sogefi-industrie.fr"] },
    { nom: "BRM Mobilier", domaines: ["brm-mobilier.fr"] },
  ],
};

/** Sans correspondants : le moteur doit se comporter exactement comme avant. */
const SANS_CORRESPONDANTS = {
  domainesInternes: CONTEXTE.domainesInternes,
  domainesAutorises: CONTEXTE.domainesAutorises,
  annuaire: CONTEXTE.annuaire,
  correspondants: [],
};

const CORPS_NEUTRE =
  "Bonjour,\n\nVeuillez trouver ci-joint notre facture du mois.\n\n" +
  "Cordialement,\nLe service comptabilité";

const CAS = [
  // ————————————————————————— Alerte attendue —————————————————————————
  {
    titre: "Fournisseur déclaré, domaine voisin (le cas visé)",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.co",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Fournisseur déclaré depuis Gmail",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    data: {
      nomAffiche: "Sogefi Industrie",
      email: "sogefi.industrie.compta@gmail.com",
      objet: "Relance facture",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Le fait suffit : aucune demande sensible dans le message",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    data: {
      nomAffiche: "BRM Mobilier",
      email: "contact@brm-mobilier-sav.net",
      objet: "Nouveau catalogue",
      corps: "Bonjour,\n\nNotre catalogue est en ligne.\n\nL'équipe BRM",
    },
  },
  {
    titre: "Nom affiché neutre, signature au nom du fournisseur",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    data: {
      nomAffiche: "Service Comptabilité",
      email: "compta@delta-log-groupe.net",
      objet: "Facture",
      corps:
        "Bonjour,\n\nVoici la facture du mois.\n\nCordialement,\n" +
        "Le service comptable\nDelta-Log SARL",
    },
  },
  {
    titre: "Forme juridique différente de celle déclarée",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    data: {
      // Déclaré « Delta-Log SARL », se présente « DELTA LOG S.A.S. »
      nomAffiche: "DELTA LOG S.A.S.",
      email: "facturation@delta-log.eu",
      objet: "Facture",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Faux fournisseur + changement de RIB : le score plafonne",
    attendu: "élevé",
    raisonsAttendues: ["correspondant_domaine_inhabituel"],
    // Le détecteur de RIB retient l'une ou l'autre de ses deux raisons selon
    // qu'il reconnaît un IBAN vérifiable dans le corps ; l'essai porte ici sur
    // le CUMUL, pas sur laquelle des deux.
    familleRibAttendue: true,
    scoreAttendu: 100,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.co",
      objet: "Changement de coordonnées bancaires",
      corps:
        "Bonjour,\n\nNotre banque a changé. Merci de régler nos prochaines " +
        "factures sur le nouveau compte : FR76 3000 4000 0512 3456 7890 143.\n\n" +
        "Cordialement,\nDelta-Log SARL",
    },
  },

  // ————————————————————————— Aucune alerte —————————————————————————
  {
    titre: "Le fournisseur écrit depuis son domaine principal",
    attendu: null,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.fr",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Le fournisseur écrit depuis son domaine SECONDAIRE",
    attendu: null,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.com",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Sous-domaine d'un domaine déclaré",
    attendu: null,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "noreply@mail.delta-log.fr",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Un collègue transfère la facture du fournisseur",
    attendu: null,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "yacine@safentreprise.fr",
      objet: "TR : Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Plateforme de facturation en liste autorisée",
    attendu: null,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "noreply@facturation-partenaire.com",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Le nom du fournisseur n'est qu'une sous-chaîne d'un autre mot",
    attendu: null,
    data: {
      // « Catalogues Mobiliers » ne contient PAS la suite « brm mobilier ».
      nomAffiche: "Catalogues Mobiliers Réunis",
      email: "contact@catalogues-mobiliers-reunis.fr",
      objet: "Notre offre",
      corps:
        "Bonjour,\n\nDécouvrez notre offre.\n\nCatalogues Mobiliers Réunis",
    },
  },
  {
    titre: "Le fournisseur est cité dans le CORPS, pas dans la signature",
    attendu: null,
    data: {
      nomAffiche: "Cabinet Verne",
      email: "contact@cabinet-verne.fr",
      objet: "Votre dossier",
      corps:
        "Bonjour,\n\nNous avons bien reçu la facture de Delta-Log SARL et " +
        "nous la traitons cette semaine. Nous reviendrons vers vous si " +
        "un justificatif manque au dossier.\n\nBien à vous,\n" +
        "Cabinet Verne\nExpertise comptable\n01 40 00 00 00",
    },
  },
  {
    titre: "Aucun correspondant déclaré : la règle se tait",
    attendu: null,
    contexte: SANS_CORRESPONDANTS,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.co",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Aucun contexte du tout : le moteur nu est inchangé",
    attendu: null,
    contexte: undefined,
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.co",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Un correspondant au nom trop court ne déclenche rien",
    attendu: null,
    contexte: {
      ...CONTEXTE,
      correspondants: [{ nom: "SA", domaines: ["exemple.fr"] }],
    },
    data: {
      nomAffiche: "Cabinet Verne",
      email: "contact@cabinet-verne.fr",
      objet: "Votre dossier",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Correspondant sans domaine : entrée ignorée, pas d'alerte",
    attendu: null,
    contexte: {
      ...CONTEXTE,
      correspondants: [{ nom: "Delta-Log SARL", domaines: [] }],
    },
    data: {
      nomAffiche: "Delta-Log SARL",
      email: "compta@delta-log.co",
      objet: "Facture 2026-0914",
      corps: CORPS_NEUTRE,
    },
  },
  {
    titre: "Deux correspondants cités, l'expéditeur est chez lui",
    attendu: null,
    data: {
      // Sogefi écrit depuis SON domaine et cite Delta-Log en signature :
      // sans la sortie anticipée, Delta-Log ferait passer le message à élevé.
      nomAffiche: "Sogefi Industrie",
      email: "compta@sogefi-industrie.fr",
      objet: "Votre commande",
      corps:
        "Bonjour,\n\nVotre commande part demain.\n\nCordialement,\n" +
        "Sogefi Industrie\nPartenaire de Delta-Log SARL",
    },
  },
];

/* ========================================================================= */

function libelle(v) {
  return v === null ? "aucune" : v;
}

function tronquer(t, n) {
  const s = String(t);
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

let echecs = 0;
const lignes = [];

for (const cas of CAS) {
  const contexte = "contexte" in cas ? cas.contexte : CONTEXTE;
  const r = SG.analyserEmail(cas.data, contexte);
  const obtenu = r.alerte ? r.niveau : null;

  const manquantes = (cas.raisonsAttendues || []).filter(
    (raison) => !r.raisons.includes(raison)
  );
  const scoreOk =
    cas.scoreAttendu === undefined || r.score === cas.scoreAttendu;

  const RAISONS_RIB = [
    "changement_coordonnees_bancaires",
    "changement_bancaire_annonce",
  ];
  const ribOk =
    !cas.familleRibAttendue ||
    RAISONS_RIB.some((raison) => r.raisons.includes(raison));

  // ⚠ UN CAS « AUCUNE ALERTE » NE DOIT PAS NON PLUS PORTER LA RAISON. Un
  //   message qui atteindrait « modéré » par ailleurs tout en ayant déclenché
  //   cette règle-ci passerait le contrôle de niveau sans qu'on le voie.
  const parasite =
    cas.attendu === null && r.raisons.includes("correspondant_domaine_inhabituel");

  const ok =
    obtenu === cas.attendu &&
    manquantes.length === 0 &&
    scoreOk &&
    ribOk &&
    !parasite;
  if (!ok) echecs += 1;

  lignes.push({
    ok,
    titre: cas.titre,
    manquantes,
    parasite,
    scoreOk,
    ribOk,
    attendu: libelle(cas.attendu),
    obtenu: libelle(obtenu),
    score: `${r.score}/100`,
    raisons: r.raisons.join(", ") || "—",
    motif: r.motifNonAlerte,
  });
}

const L = { titre: 58, niveau: 10, score: 8 };
const sep = "─".repeat(L.titre + L.niveau * 2 + L.score + 14);

console.log("\n  CORRESPONDANTS DE CONFIANCE — FAUX FOURNISSEUR\n");
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
  if (!l.ok) {
    console.log(`     raisons : ${l.raisons}\n     motif   : ${l.motif}`);
    if (l.manquantes.length > 0) {
      console.log(`     ⚠ raison(s) attendue(s) absente(s) : ${l.manquantes.join(", ")}`);
    }
    if (l.parasite) {
      console.log("     ⚠ la règle a déclenché alors qu'elle ne devait pas");
    }
    if (!l.scoreOk) console.log("     ⚠ score inattendu");
    if (!l.ribOk) console.log("     ⚠ aucune raison de la famille RIB");
  }
}
console.log(sep);

console.log(
  echecs === 0
    ? `\n  ${CAS.length}/${CAS.length} cas conformes\n`
    : `\n  ${CAS.length - echecs}/${CAS.length} — ${echecs} échec(s)\n`
);
process.exit(echecs === 0 ? 0 : 1);
