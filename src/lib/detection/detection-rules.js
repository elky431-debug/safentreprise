/**
 * Safentreprise Guard — règles de détection V3 (principe universel)
 *
 * AUCUNE configuration : le nom du dirigeant n'a pas à être connu à l'avance.
 * 100 % règles, aucun appel réseau, aucune IA.
 *
 * PRINCIPE CENTRAL — l'incohérence NOM ↔ ADRESSE
 * ---------------------------------------------------------------------------
 * Une arnaque au président se trahit par une contradiction : le message se
 * présente au nom d'une personne (signature de fin, ou nom affiché de
 * l'expéditeur), mais l'adresse d'envoi ne correspond à aucune forme
 * reconnaissable de ce nom.
 *
 *   « Cordialement, Yacine El Fahim » depuis yacine.elfahim@societe.com  → cohérent
 *   « Cordialement, Yacine El Fahim » depuis contact2024@gmail.com       → INCOHÉRENT
 *
 * Le niveau d'alerte monte ensuite avec les signaux cumulés :
 *   incohérence seule                              → 🟡 faible  (« à vérifier »)
 *   incohérence + demande sensible                 → 🟠 modéré
 *   incohérence + messagerie grand public + demande → 🔴 élevé
 *
 * Les PORTES BLOQUANTES priment toujours : liste blanche de services connus,
 * nom en position de destinataire, adresse cohérente avec le nom.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Seuils
  // ---------------------------------------------------------------------------

  /** Score minimal pour afficher une bannière. */
  const SEUIL_ALERTE = 30;
  /** Score à partir duquel le risque devient « modéré ». */
  const SEUIL_RISQUE_MODERE = 55;
  /** Score à partir duquel le risque devient « élevé ». */
  const SEUIL_RISQUE_ELEVE = 75;

  // ---------------------------------------------------------------------------
  // LISTE BLANCHE — services de confiance
  // ---------------------------------------------------------------------------

  /**
   * Domaines d'expéditeurs légitimes connus.
   *
   * Un email provenant de l'un de ces domaines (ou d'un de ses sous-domaines,
   * ex. « e.linkedin.com ») n'est JAMAIS analysé : ces services envoient des
   * notifications automatiques qui citent le nom du DESTINATAIRE, et ne se
   * font jamais passer pour une personne physique de votre entreprise.
   *
   * ▸ POUR PERSONNALISER : ajoutez/retirez simplement des entrées ici.
   *   Le rapprochement se fait sur le domaine exact OU un sous-domaine.
   *   Ajustable aussi à chaud depuis la console :
   *     SafentrepriseGuard.DOMAINES_DE_CONFIANCE.push("mon-crm.com");
   *
   * ⚠ N'y placez jamais une messagerie grand public (gmail.com, outlook.com…) :
   *   ce sont justement les vecteurs classiques de fraude. Une garde à
   *   l'exécution les ignore de toute façon (voir `estDomaineDeConfiance`).
   */
  const DOMAINES_DE_CONFIANCE = [
    // — Réseaux sociaux & plateformes pro —
    "linkedin.com", "slack.com", "github.com", "gitlab.com", "atlassian.com",
    "notion.so", "zoom.us", "dropbox.com", "docusign.com", "docusign.net",
    "calendly.com", "meta.com", "facebookmail.com", "instagram.com",
    "twitter.com", "x.com",

    // — Grands éditeurs / cloud —
    "google.com", "youtube.com", "microsoft.com", "microsoftonline.com",
    "office.com", "azure.com", "skype.com", "apple.com", "adobe.com",
    "oracle.com", "ibm.com", "sap.com", "salesforce.com", "hubspot.com",
    "mailchimp.com", "sendgrid.net", "intuit.com", "sage.com",

    // — Commerce & paiement —
    "amazon.com", "amazon.fr", "paypal.com", "paypal.fr", "stripe.com",
    "ebay.com", "ebay.fr", "booking.com", "airbnb.com", "uber.com",
    "netflix.com", "spotify.com",

    // — Banques & néobanques (France) —
    "bnpparibas.com", "bnpparibas.net", "societegenerale.fr",
    "credit-agricole.fr", "lcl.fr", "caisse-epargne.fr", "banquepopulaire.fr",
    "creditmutuel.fr", "cic.fr", "labanquepostale.fr", "hellobank.fr",
    "boursorama.com", "boursobank.com", "fortuneo.fr", "ing.fr", "n26.com",
    "revolut.com", "qonto.com", "shine.fr",

    // — Administrations & services publics (France) —
    "gouv.fr", "urssaf.fr", "ameli.fr", "service-public.fr", "laposte.fr",
    "chronopost.fr", "colissimo.fr",

    // — Télécoms (domaines corporate, pas les messageries grand public) —
    "orange.com", "sfr.com", "bouyguestelecom.fr", "free-mobile.fr",
  ];

  /** Messageries grand public : signal fort quand on se présente au nom d'une personne. */
  const DOMAINES_GRAND_PUBLIC = [
    "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com",
    "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr",
    "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com",
    "mail.com", "gmx.com", "gmx.fr", "orange.fr", "wanadoo.fr", "free.fr",
    "laposte.net", "sfr.fr", "bbox.fr",
  ];

  // ---------------------------------------------------------------------------
  // Vocabulaires
  // ---------------------------------------------------------------------------

  /** DEMANDES SENSIBLES — le cœur d'une arnaque au président (liste large). */
  const DEMANDES_SENSIBLES = [
    "virement", "virements", "virer", "rib", "iban", "bic", "swift",
    "coordonnees bancaires", "coordonnees bancaire", "compte bancaire",
    "changement de compte", "changement de rib", "changement d iban",
    "nouveau rib", "nouvel iban", "nouveau compte", "nouvelles coordonnees",
    "transfert de fonds", "transferer les fonds", "transferer le solde",
    "transferer la somme", "solde du compte", "paiement", "paiements",
    "payer", "reglement", "regler la facture", "regler cette facture",
    "acompte", "avance de fonds", "decaissement", "prelevement",
    "carte cadeau", "cartes cadeaux", "bons d achat", "bon d achat",
    "bitcoin", "crypto", "cryptomonnaie", "mandat", "cheque",
    "wire transfer", "bank details", "payment", "invoice",
  ];

  /** AMPLIFICATEURS — urgence, secret, indisponibilité. Jamais suffisants seuls. */
  const AMPLIFICATEURS = [
    "urgent", "urgente", "urgence", "immediat", "immediate", "immediatement",
    "au plus vite", "avant ce soir", "avant midi", "aujourd hui meme",
    "dans l heure", "sans delai", "confidentiel", "confidentielle",
    "confidentialite", "discret", "discrete", "discretion", "entre nous",
    "ne le dites a personne", "ne dis rien", "sans en parler",
    "n en parlez a personne", "ne pas en parler", "secret",
    "je suis en reunion", "je ne suis pas joignable", "je suis en deplacement",
    "je suis injoignable", "en clientele", "a l etranger",
  ];

  /** Formules de politesse annonçant une signature. */
  const FORMULES_CLOTURE = [
    "cordialement", "bien cordialement", "tres cordialement", "bien a vous",
    "salutations", "sincerement", "respectueusement", "merci d avance",
    "merci par avance", "dans l attente", "a bientot", "bonne journee",
    "bonne reception", "cdt", "cdlt", "regards", "best regards",
    "kind regards", "sincerely", "thanks", "envoye de mon iphone",
    "envoye depuis mon", "sent from my",
  ];

  /** Formulations qui PRÉCÈDENT le nom d'un destinataire. */
  const PREFIXES_DESTINATAIRE = [
    "bonjour", "bonsoir", "salut", "coucou", "hi", "hello", "hey", "dear",
    "cher", "chere", "chers", "cheres", "bienvenue", "felicitations", "bravo",
    "destine a", "destinee a", "a l attention de", "a destination de",
    "adresse a", "adressee a", "envoye a", "envoyee a", "pour le compte de",
    "au nom de", "compte de", "profil de", "madame", "monsieur", "mme",
    "mlle", "pour", "to", "a",
  ];

  /** Formulations qui SUIVENT le nom d'un destinataire. */
  const SUFFIXES_DESTINATAIRE = [
    "vous", "votre", "vos", "tu", "ton", "ta", "tes", "nous", "voici",
    "decouvrez", "consultez", "bienvenue", "et", "a rejoint", "a partage",
    "a consulte", "vient de", "souhaite", "you", "your",
  ];

  /** Marqueurs de pied de page automatique (newsletters, notifications). */
  const MARQUEURS_PIED_AUTOMATIQUE = [
    "se desabonner", "desabonnement", "unsubscribe", "vous recevez cet",
    "vous recevez ce", "cet email a ete envoye", "ce message a ete envoye",
    "gerer vos preferences", "gerer mes preferences", "ne pas repondre",
    "no reply", "noreply", "message automatique", "notification automatique",
  ];

  /**
   * Particules nobiliaires / de liaison. Elles font partie du nom mais ne
   * comptent pas comme « partie significative » (ex. « El » dans El Fahim).
   */
  const PARTICULES = new Set([
    "de", "du", "des", "la", "le", "les", "el", "al", "ali", "van", "von",
    "der", "den", "di", "da", "do", "dos", "ben", "bin", "ibn", "mac", "mc",
    "saint", "sainte", "ste", "st", "abd", "abou", "bou",
  ]);

  /**
   * Mots qui disqualifient une ligne comme « nom de personne ».
   * Sans eux, « Direction Générale », « Support Client » ou « Facture Pro »
   * seraient pris pour des noms propres.
   */
  const MOTS_NON_NOM = new Set([
    // Politesse & formules
    "cordialement", "bien", "tres", "salutations", "sincerement",
    "respectueusement", "merci", "avance", "attente", "bonjour", "bonsoir",
    "salut", "hello", "hi", "dear", "cher", "chere", "regards", "sincerely",
    "thanks", "bonne", "journee", "soiree", "reception", "bientot",
    // Titres & fonctions
    "president", "presidente", "pdg", "directeur", "directrice", "direction",
    "general", "generale", "adjoint", "adjointe", "gerant", "gerante",
    "responsable", "manager", "chef", "cheffe", "assistant", "assistante",
    "secretaire", "secretariat", "comptable", "comptabilite", "tresorier",
    "tresorerie", "financier", "finance", "ressources", "humaines",
    "commercial", "commerciale", "technicien", "ingenieur", "consultant",
    "docteur", "maitre", "monsieur", "madame", "mademoiselle", "mme", "mlle",
    // Entités & services
    "service", "services", "equipe", "team", "support", "client", "clients",
    "societe", "entreprise", "groupe", "group", "company", "agence",
    "cabinet", "bureau", "departement", "division", "siege", "administration",
    "sarl", "sas", "sasu", "eurl", "scop", "sci", "spa", "ltd", "inc",
    // Coordonnées & pied de page
    "tel", "telephone", "mobile", "portable", "fax", "email", "mail",
    "courriel", "adresse", "site", "web", "www", "envoye", "envoyee",
    "depuis", "mon", "iphone", "ipad", "android", "smartphone", "message",
    "confidentialite", "avertissement", "notification", "newsletter",
    "facture", "commande", "livraison", "info", "infos", "contact",
    "pro", "expert", "conseil", "conseils", "partenaire", "staff", "admin",
    // Bouts de phrase fréquents en fin de message
    "voir", "piece", "pieces", "jointe", "jointes", "joint", "joints",
    "suite", "reponse", "objet", "dossier", "document", "documents",
    "fichier", "fichiers", "ci", "dessous", "dessus", "informations",
  ]);

  // ---------------------------------------------------------------------------
  // Utilitaires de normalisation
  // ---------------------------------------------------------------------------

  /** Minuscules, sans accents, sans ponctuation. */
  function normaliser(texte) {
    if (!texte) return "";
    return String(texte)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9@.\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Normalise une ligne en conservant la ponctuation utile au contexte. */
  function normaliserLigne(ligne) {
    if (!ligne) return "";
    return String(ligne)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9@.,:;!?\s-]/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  /** Échappe les métacaractères d'une RegExp. */
  function echapperRegex(texte) {
    return String(texte).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Sépare partie locale et domaine d'une adresse email. */
  function parserEmail(adresse) {
    const brute = String(adresse || "").trim().toLowerCase();
    const match = brute.match(/^([^@\s]+)@([^@\s]+)$/);
    if (!match) return { local: "", domaine: "", email: brute };
    return { local: match[1], domaine: match[2], email: brute };
  }

  /** Présence d'un mot-clé, en respectant les frontières de mots. */
  function contientMotCle(texteNormalise, motCle) {
    const mot = normaliser(motCle);
    if (!mot || !texteNormalise) return false;
    return new RegExp(
      `(^|[^a-z0-9])${echapperRegex(mot)}([^a-z0-9]|$)`
    ).test(texteNormalise);
  }

  /** Mots-clés d'une liste effectivement présents dans le texte. */
  function motsClesPresents(texteNormalise, liste) {
    return liste.filter((mot) => contientMotCle(texteNormalise, mot));
  }

  // ---------------------------------------------------------------------------
  // Domaines
  // ---------------------------------------------------------------------------

  /**
   * Le domaine appartient-il à un service de confiance ?
   * Rapprochement ANCRÉ : « linkedin.com » et « e.linkedin.com » passent,
   * mais « linkedin.com.arnaque.ru » non.
   */
  function estDomaineDeConfiance(domaine) {
    const d = String(domaine || "").trim().toLowerCase().replace(/\.$/, "");
    if (!d) return false;
    // Garde-fou : une messagerie grand public n'est jamais « de confiance ».
    if (DOMAINES_GRAND_PUBLIC.includes(d)) return false;
    return DOMAINES_DE_CONFIANCE.some((c) => {
      const conf = String(c || "").trim().toLowerCase();
      return conf && (d === conf || d.endsWith(`.${conf}`));
    });
  }

  /** Le domaine est-il une messagerie grand public ? */
  function estDomaineGrandPublic(domaine) {
    return DOMAINES_GRAND_PUBLIC.includes(
      String(domaine || "").trim().toLowerCase()
    );
  }

  // ---------------------------------------------------------------------------
  // Reconnaissance d'un NOM DE PERSONNE (sans configuration préalable)
  // ---------------------------------------------------------------------------

  /**
   * Une chaîne ressemble-t-elle à un nom de personne ?
   * Critères : 2 à 4 mots, uniquement alphabétiques, chacun commençant par une
   * majuscule (les particules échappent à cette règle), aucun mot appartenant
   * au vocabulaire des fonctions/services, et au moins 2 mots significatifs.
   *
   * @returns {string|null} le nom nettoyé, ou null si ce n'est pas un nom.
   */
  function reconnaitreNomDePersonne(chaine) {
    const ligne = String(chaine || "").trim().replace(/^[-–—•*\s]+/, "").replace(/[,;.:]+$/, "");
    if (!ligne || ligne.length > 45) return null;

    // Chiffres, adresses, URL, balises → ce n'est pas une ligne de nom
    if (/[0-9@<>|/\\]/.test(ligne)) return null;
    if (/https?:/i.test(ligne)) return null;

    const mots = ligne.split(/\s+/).filter(Boolean);
    if (mots.length < 2 || mots.length > 4) return null;

    let significatifs = 0;
    let avecMajuscule = 0;

    for (const mot of mots) {
      const nettoye = mot.replace(/['’`\-]/g, "");
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(nettoye)) return null;

      const norm = normaliser(nettoye);
      if (!norm) return null;
      if (MOTS_NON_NOM.has(norm)) return null;

      // Les particules sont admises en minuscules et ne comptent pas
      if (PARTICULES.has(norm)) continue;

      if (norm.length < 2) return null;
      significatifs += 1;
      if (/^[A-ZÀ-ÖØ-Þ]/.test(nettoye)) avecMajuscule += 1;
    }

    if (significatifs < 2) return null;

    // Au moins la MOITIÉ des mots significatifs porte une majuscule.
    // Exiger une majuscule partout rejetterait « Clement faussé », très
    // courant en signature ; n'en exiger aucune ferait passer des bouts de
    // phrase comme « Voir pièce jointe » (1 majuscule sur 3) pour un nom.
    return avecMajuscule >= Math.ceil(significatifs / 2) ? ligne : null;
  }

  /**
   * Formes d'un nom, classées par force probante.
   *
   * ▸ FORTES — elles contiennent le NOM DE FAMILLE, qui identifie réellement
   *   une personne. Recherchées par INCLUSION dans la partie locale :
   *   « elfahim.compta@… » reste cohérent avec « Yacine El Fahim ».
   *
   * ▸ EXACTES — prénom seul et initiales. Bien trop courants pour être
   *   cherchés par inclusion : « yacine.direction.groupe@gmail.com »
   *   contiendrait « yacine » et passerait pour cohérent alors que
   *   l'adresse n'appartient manifestement pas à cette personne. On exige
   *   donc que la partie locale leur soit ÉGALE (chiffres ignorés).
   */
  function formesClassees(nom) {
    const parties = normaliser(nom).split(" ").filter(Boolean);
    const significatives = parties.filter(
      (p) => !PARTICULES.has(p) && p.length >= 2
    );
    if (!significatives.length) return { fortes: [], exactes: [] };

    const prenom = significatives[0];
    const famille = significatives[significatives.length - 1];
    const fortes = new Set();
    const exactes = new Set();

    if (famille.length >= 3) {
      fortes.add(famille);                 // fahim
      fortes.add(prenom + famille);        // yacinefahim
      fortes.add(famille + prenom);        // fahimyacine
      fortes.add(prenom[0] + famille);     // yfahim
      fortes.add(famille + prenom[0]);     // fahimy
      fortes.add(parties.join(""));        // yacineelfahim
      fortes.add(significatives.join(""));  // yacinefahim
    }
    // Parties intermédiaires (noms composés : « Jean Pierre Durand »)
    significatives.slice(1).forEach((p) => {
      if (p.length >= 3) fortes.add(p);
    });

    exactes.add(prenom);                                   // yacine
    exactes.add(prenom + famille[0]);                      // yacinef
    exactes.add(significatives.map((p) => p[0]).join("")); // yf
    exactes.add(parties.map((p) => p[0]).join(""));        // yef

    return {
      fortes: [...fortes].filter((f) => f && f.length >= 3),
      exactes: [...exactes].filter((f) => f && f.length >= 2),
    };
  }

  /** Liste à plat des formes reconnues (API publique / logs). */
  function formesDuNom(nom) {
    const { fortes, exactes } = formesClassees(nom);
    return [...new Set([...fortes, ...exactes])];
  }

  /** L'adresse contient-elle une forme reconnaissable du nom ? */
  function nomCorrespondALAdresse(nom, partieLocale) {
    const local = normaliser(partieLocale).replace(/[^a-z0-9]/g, "");
    if (!local || !nom) return false;

    const { fortes, exactes } = formesClassees(nom);
    if (fortes.some((forme) => local.includes(forme))) return true;

    // Prénom seul / initiales : égalité stricte, chiffres ignorés
    // (« yacine2024@… » reste l'adresse personnelle de Yacine).
    const sansChiffres = local.replace(/[0-9]/g, "");
    return exactes.some((forme) => local === forme || sansChiffres === forme);
  }

  // ---------------------------------------------------------------------------
  // Analyse du corps : signature de fin vs contexte destinataire
  // ---------------------------------------------------------------------------

  /** Lignes non vides du corps, texte brut ET normalisé. */
  function decouperEnLignes(corps) {
    const lignes = [];
    for (const brute of String(corps || "").split(/\r?\n/)) {
      const texte = brute.trim();
      if (texte) lignes.push({ brut: texte, norm: normaliserLigne(texte) });
    }
    return lignes;
  }

  /** La ligne est-elle une formule de politesse de fin ? */
  function estFormuleCloture(ligneNormalisee) {
    return FORMULES_CLOTURE.some((f) => contientMotCle(ligneNormalisee, f));
  }

  /** La ligne relève-t-elle d'un pied de page automatique ? */
  function estPiedAutomatique(ligneNormalisee) {
    return MARQUEURS_PIED_AUTOMATIQUE.some((m) =>
      contientMotCle(ligneNormalisee, m)
    );
  }

  /**
   * Le nom donné apparaît-il quelque part en position de DESTINATAIRE ?
   * (« Bonjour Yacine El Fahim », « Yacine El Fahim, vous avez… », pied de page)
   */
  function nomEnContexteDestinataire(lignes, nom) {
    const parties = normaliser(nom).split(" ").filter(Boolean);
    if (!parties.length) return false;
    const motif = new RegExp(
      parties.map(echapperRegex).join("[^a-z0-9]{0,3}"),
      "g"
    );

    for (const ligne of lignes) {
      motif.lastIndex = 0;
      let match;
      while ((match = motif.exec(ligne.norm)) !== null) {
        const avant = ligne.norm.slice(0, match.index).slice(-40);
        const apres = ligne.norm.slice(match.index + match[0].length).slice(0, 40);

        const prefixe = PREFIXES_DESTINATAIRE.some((p) =>
          new RegExp(
            `(^|[^a-z0-9])${echapperRegex(normaliser(p))}\\s*[,:!-]?\\s*$`
          ).test(avant)
        );
        const suffixe = SUFFIXES_DESTINATAIRE.some((s) =>
          new RegExp(
            `^\\s*[,:;!?-]?\\s*${echapperRegex(normaliser(s))}([^a-z0-9]|$)`
          ).test(apres)
        );

        if (prefixe || suffixe || estPiedAutomatique(ligne.norm)) return true;
      }
    }
    return false;
  }

  /**
   * Extrait le nom en SIGNATURE DE FIN, sans le connaître à l'avance.
   *
   * On remonte depuis la fin du message et l'on retient la première ligne qui
   * ressemble à un nom de personne, à condition qu'elle soit soit précédée
   * d'une formule de politesse toute proche, soit située dans les toutes
   * dernières lignes (mise en page classique d'une signature).
   *
   * @returns {{nom: string, ligne: number, apresFormule: boolean}|null}
   */
  function extraireNomSignature(corps) {
    const lignes = decouperEnLignes(corps);
    if (!lignes.length) return null;

    const total = lignes.length;
    const debutZone = Math.max(0, total - 8); // zone « fin de message »

    for (let i = total - 1; i >= debutZone; i -= 1) {
      const nom = reconnaitreNomDePersonne(lignes[i].brut);
      if (!nom) continue;

      // Une formule de politesse dans les 3 lignes précédentes ?
      let apresFormule = false;
      for (let j = Math.max(0, i - 3); j < i; j += 1) {
        if (estFormuleCloture(lignes[j].norm)) apresFormule = true;
      }

      const dansToutesDernieres = i >= total - 3;
      if (!apresFormule && !dansToutesDernieres) continue;

      // Garde-fou : si ce même nom apparaît ailleurs en position de
      // destinataire, ce n'est pas une signature d'expéditeur.
      if (nomEnContexteDestinataire(lignes, nom)) continue;

      return { nom, ligne: i, apresFormule };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Journalisation
  // ---------------------------------------------------------------------------

  let DEBUG = true;

  /** Trace groupée expliquant la décision — alerte ou non. */
  function journaliser(r) {
    if (!DEBUG || typeof console === "undefined") return;

    const emoji = { élevé: "🔴", modéré: "🟠", faible: "🟡" };
    const titre = r.alerte
      ? `[Safentreprise Guard] ${emoji[r.niveau] || "⚠"} ALERTE ${r.niveau} (${r.score}/100)`
      : `[Safentreprise Guard] ✓ Pas d'alerte (${r.score}/100)`;

    console[console.groupCollapsed ? "groupCollapsed" : "log"](titre);

    console.log("Nom affiché (De)   :", r.meta.nomAffiche || "(vide)");
    console.log("Nom en signature   :", r.nomSignature || "(aucun détecté)");
    console.log("Adresse réelle     :", r.meta.email || "(vide)");
    console.log("  ├─ partie locale :", r.meta.local || "(vide)");
    console.log("  └─ domaine       :", r.meta.domaine || "(vide)",
      r.meta.domaineDeConfiance ? "(liste blanche)"
        : r.meta.domaineGrandPublic ? "(messagerie grand public)" : "");
    console.log("Nom retenu         :", r.nomRetenu || "(aucun)",
      r.sourceNom ? `(source : ${r.sourceNom})` : "");
    console.log("Correspondance     :", r.nomRetenu
      ? (r.incoherence ? "❌ INCOHÉRENTE — l'adresse ne contient aucune forme du nom"
                       : "✅ cohérente")
      : "(non évaluable)");
    if (r.formesTestees && r.formesTestees.length) {
      console.log("  formes testées   :", r.formesTestees.join(", "));
    }
    console.log("Demandes sensibles :", r.demandesSensibles.length ? r.demandesSensibles : "(aucune)");
    console.log("Amplificateurs     :", r.amplificateurs.length ? r.amplificateurs : "(aucun)");
    console.log("Signaux retenus    :", r.raisons.length ? r.raisons : "(aucun)");
    r.signaux.forEach((s) => console.log("  •", s));
    console.log("DÉCISION           :", r.decision);
    if (!r.alerte && r.motifNonAlerte) console.log("Motif              :", r.motifNonAlerte);

    if (console.groupEnd) console.groupEnd();
  }

  // ---------------------------------------------------------------------------
  // Analyse principale
  // ---------------------------------------------------------------------------

  /** Construit un résultat « aucune alerte ». */
  function sansAlerte(base, decision, motif, score) {
    return Object.assign(base, {
      score: typeof score === "number" ? score : 0,
      alerte: false,
      niveau: "faible",
      decision,
      motifNonAlerte: motif,
    });
  }

  /**
   * Un détecteur renonce.
   *
   * La PORTÉE dit qui se tait :
   *
   *   « globale »   — plus personne ne parle. Réservé aux cas où le message
   *                   entier est hors sujet : un expéditeur en liste blanche
   *                   n'usurpe l'identité de personne et ne demande rien.
   *   « detecteur » — ce détecteur-ci n'a rien à dire, les autres continuent.
   *
   * C'est toute la différence avec l'ancien fonctionnement, où le détecteur
   * d'identité était l'unique chemin : faute de nom de personne à comparer, il
   * sortait, et le message n'était plus examiné du tout. Un changement de RIB
   * signé « Comptabilité DELTA-LOG » passait ainsi sans qu'aucune règle ne
   * l'ait seulement regardé.
   */
  function abandon(portee, decision, motif) {
    return { abandon: { portee, decision, motif } };
  }

  /** Ce qu'un détecteur verse au score commun. */
  function apports(liste) {
    return { apports: liste };
  }

  /**
   * Contexte facultatif, fourni par l'appelant.
   *
   * Le moteur ne fait AUCUN appel réseau et ne doit jamais en faire : il doit
   * rester chargeable tel quel dans un navigateur. Les faits qu'il ne peut pas
   * établir seul — domaines du locataire, annuaire, résultats SPF/DKIM/DMARC —
   * lui sont donc PASSÉS par l'appelant qui, lui, a le droit d'aller les
   * chercher.
   *
   * Absent, le moteur se comporte exactement comme sans lui. C'est ce qui
   * permettra à un adaptateur Gmail de réutiliser le même fichier.
   */
  function normaliserContexte(contexte) {
    const c = contexte || {};
    const tableau = (v) => (Array.isArray(v) ? v : []);
    return {
      fourni: Boolean(contexte),
      /** Domaines réellement possédés par le locataire. */
      domainesInternes: tableau(c.domainesInternes),
      /** Domaines tiers légitimes : routeurs d'emailing, partenaires. */
      domainesAutorises: tableau(c.domainesAutorises),
      /** Instantané de l'annuaire : [{ nom, email }]. */
      annuaire: tableau(c.annuaire),
      /** { spf, dkim, dmarc, compauth } tels que lus dans les en-têtes. */
      authentification: c.authentification || null,
      /** Adresse de réponse, si elle diffère de l'expéditeur. */
      replyTo: typeof c.replyTo === "string" ? c.replyTo : null,
    };
  }

  /** Travail commun à tous les détecteurs : parsing, normalisation, méta. */
  function preparer(emailData, contexte) {
    const nomAffiche = (emailData && emailData.nomAffiche) || "";
    const adresse = (emailData && emailData.email) || "";
    const objet = (emailData && emailData.objet) || "";
    const corps = (emailData && emailData.corps) || "";

    const { local, domaine, email } = parserEmail(adresse);
    const texteAnalyse = normaliser(`${objet}\n${corps}`);

    const demandesSensibles = motsClesPresents(texteAnalyse, DEMANDES_SENSIBLES);
    const amplificateurs = motsClesPresents(texteAnalyse, AMPLIFICATEURS);
    const domaineConfiance = estDomaineDeConfiance(domaine);
    const domaineGrandPublic = estDomaineGrandPublic(domaine);

    const base = {
      seuil: SEUIL_ALERTE,
      nomSignature: null,
      nomExpediteur: null,
      nomRetenu: null,
      sourceNom: null,
      formesTestees: [],
      incoherence: false,
      demandesSensibles,
      amplificateurs,
      signaux: [],
      raisons: [],
      motifNonAlerte: "",
      meta: {
        nomAffiche,
        email,
        local,
        domaine,
        domaineDeConfiance: domaineConfiance,
        domaineGrandPublic,
        corpsDisponible: Boolean(corps && String(corps).trim()),
        longueurCorps: corps ? String(corps).length : 0,
      },
    };

    return {
      base,
      corps,
      nomAffiche,
      email,
      local,
      domaine,
      domaineConfiance,
      domaineGrandPublic,
      demandesSensibles,
      amplificateurs,
      texteAnalyse,
      contexte: normaliserContexte(contexte),
    };
  }

  // ---------------------------------------------------------------------------
  // Détecteur — IDENTITÉ (incohérence nom ↔ adresse)
  // ---------------------------------------------------------------------------

  /**
   * Le détecteur historique, inchangé dans sa logique.
   *
   * Il n'est plus l'unique chemin d'analyse : c'est désormais un détecteur
   * parmi d'autres. Ses portes ne font donc plus taire que lui — sauf la
   * porte 1, dont la portée reste globale.
   */
  function detecterIdentite(prep) {
    const base = prep.base;
    const {
      corps,
      nomAffiche,
      email,
      local,
      domaine,
      domaineConfiance,
      domaineGrandPublic,
      demandesSensibles,
      amplificateurs,
    } = prep;

    // =========================================================================
    // PORTES BLOQUANTES
    // =========================================================================

    // Porte 1 — Service de confiance : ces expéditeurs citent le nom du
    // destinataire et n'usurpent l'identité de personne.
    //
    // PORTÉE GLOBALE, et c'est la seule : une notification LinkedIn n'est pas
    // davantage un changement de RIB qu'une usurpation. Faire taire tous les
    // détecteurs est ici le comportement voulu.
    if (domaineConfiance) {
      return abandon(
        "globale",
        "IGNORÉ — domaine expéditeur en liste blanche",
        `Expéditeur de confiance : « ${domaine} » figure dans la liste blanche.`
      );
    }

    // — Extraction des noms —
    const signature = extraireNomSignature(corps);
    base.nomSignature = signature ? signature.nom : null;

    const nomDeExpediteur = reconnaitreNomDePersonne(nomAffiche);
    base.nomExpediteur = nomDeExpediteur;

    // Porte 2 — Aucun nom de personne détecté : rien à comparer.
    //
    // C'est ici que mourait le changement de RIB fournisseur : « Comptabilité
    // DELTA-LOG » n'est pas un nom de personne. La porte reste, mais sa portée
    // est celle de ce détecteur seul.
    if (!base.nomSignature && !base.nomExpediteur) {
      return abandon(
        "detecteur",
        "IGNORÉ — aucun nom de personne détecté",
        "Ni signature de fin ni nom d'expéditeur ne ressemblent à un nom de personne."
      );
    }

    // Porte 3 — Le nom du corps n'est qu'une adresse au DESTINATAIRE.
    // (« Bonjour Yacine El Fahim, vous avez… ») — `extraireNomSignature` a
    // déjà écarté ces cas ; il ne reste donc ici que le nom d'expéditeur.
    // Si celui-ci est absent, il n'y a plus rien à analyser.
    if (!base.nomSignature && !base.nomExpediteur) {
      return abandon(
        "detecteur",
        "IGNORÉ — nom en contexte de destinataire",
        "Le nom relevé désigne le destinataire, pas l'expéditeur."
      );
    }

    // — Correspondance nom ↔ adresse —
    // On teste TOUS les noms disponibles : si l'un d'eux colle à l'adresse,
    // il n'y a pas d'incohérence (approche conservatrice).
    const candidats = [
      base.nomSignature && { nom: base.nomSignature, source: "signature" },
      base.nomExpediteur && { nom: base.nomExpediteur, source: "nom affiché" },
    ].filter(Boolean);

    let candidatCoherent = null;
    for (const c of candidats) {
      if (nomCorrespondALAdresse(c.nom, local)) {
        candidatCoherent = c;
        break;
      }
    }

    // Le nom retenu pour l'affichage : la signature prime sur le nom affiché.
    const retenu = candidats[0];
    base.nomRetenu = retenu.nom;
    base.sourceNom = retenu.source;
    base.formesTestees = formesDuNom(retenu.nom);

    // Porte 4 — Adresse cohérente ET domaine professionnel : rien à signaler.
    //
    // On ne sort PAS si le domaine est une messagerie grand public : une
    // demande d'argent envoyée depuis gmail au nom d'un dirigeant reste le
    // scénario canonique de l'arnaque au président, même quand l'adresse
    // reprend fidèlement le nom (yacine.elfahim@gmail.com). Le signal
    // « messagerie grand public » prend alors le relais de l'incohérence.
    // NOTE — c'est cette porte qui rend le moteur aveugle au typosquatting :
    // elle ne regarde que la partie locale de l'adresse. « y.elfahim » colle à
    // « Yacine El Fahim », donc on sort — sans avoir vu que le domaine
    // safentreprlse-groupe.com n'est pas celui de l'entreprise. Le détecteur
    // de domaine, qui viendra ensuite, tranchera ce cas ; il le peut
    // précisément parce que cette porte ne le fait plus taire.
    if (candidatCoherent && !domaineGrandPublic) {
      return abandon(
        "detecteur",
        "IGNORÉ — adresse cohérente avec le nom",
        `L'adresse « ${local} » contient une forme reconnaissable de ` +
          `« ${candidatCoherent.nom} » — expéditeur cohérent.`
      );
    }

    // Porte 5 — Adresse illisible (pas de partie locale exploitable).
    if (!local) {
      return abandon(
        "detecteur",
        "IGNORÉ — adresse expéditeur indisponible",
        "Impossible d'analyser l'adresse de l'expéditeur."
      );
    }

    // =========================================================================
    // SIGNAUX & SCORE
    // =========================================================================

    const liste = [];

    // Signal 1 — INCOHÉRENCE NOM ↔ ADRESSE (signal de base, +30)
    base.incoherence = !candidatCoherent;
    if (base.incoherence) {
      liste.push({
        points: 30,
        raison: "incoherence_nom_adresse",
        signal:
          `Le message se présente au nom de « ${base.nomRetenu} » (${base.sourceNom}), ` +
          `mais l'adresse d'envoi « ${email} » ne contient aucune forme de ce nom.`,
      });
    }

    // Signal 2 — MESSAGERIE GRAND PUBLIC (+20)
    if (domaineGrandPublic) {
      liste.push({
        points: 20,
        raison: "domaine_grand_public",
        signal:
          `L'expéditeur utilise une messagerie grand public (${domaine}) tout en ` +
          `se présentant au nom d'une personne.`,
      });
    }

    // Signal 3 — DEMANDE D'ACTION SENSIBLE (+25)
    if (demandesSensibles.length > 0) {
      liste.push({
        points: 25,
        raison: "demande_sensible",
        signal: `Demande d'action sensible détectée : ${demandesSensibles.slice(0, 4).join(", ")}.`,
      });
    }

    // Signal 4 — URGENCE / SECRET / INDISPONIBILITÉ (+10)
    // Bonus comportemental : ne compte qu'en renfort d'une demande sensible,
    // l'urgence étant bien trop banale dans les échanges légitimes.
    if (amplificateurs.length > 0 && demandesSensibles.length > 0) {
      liste.push({
        points: 10,
        raison: "urgence_ou_secret",
        signal:
          `Pression à l'urgence, au secret ou à l'indisponibilité : ` +
          `${amplificateurs.slice(0, 4).join(", ")}.`,
      });
    }

    return apports(liste);
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  /**
   * Assemble les retours des détecteurs en un verdict unique.
   *
   * Le score est la somme des apports de TOUS les détecteurs. C'est le point
   * du remaniement : un détecteur qui renonce ne retire que ses propres
   * apports, il n'annule pas ceux des autres.
   */
  function composer(prep, resultats) {
    const base = prep.base;

    // Un abandon de portée globale prime sur tout le reste.
    const global = resultats.find(
      (r) => r.abandon && r.abandon.portee === "globale"
    );
    if (global) {
      const r = sansAlerte(base, global.abandon.decision, global.abandon.motif);
      journaliser(r);
      return r;
    }

    const signaux = [];
    const raisons = [];
    let score = 0;

    for (const resultat of resultats) {
      if (!resultat.apports) continue;
      for (const apport of resultat.apports) {
        score += apport.points;
        signaux.push(apport.signal);
        raisons.push(apport.raison);
      }
    }

    // Personne n'a rien à dire : on reprend le motif du premier détecteur qui
    // a renoncé, nettement plus parlant qu'un « score insuffisant » générique.
    if (signaux.length === 0) {
      const premier = resultats.find((r) => r.abandon);
      if (premier) {
        const r = sansAlerte(base, premier.abandon.decision, premier.abandon.motif);
        journaliser(r);
        return r;
      }
    }

    score = Math.min(100, score);

    let niveau = "faible";
    if (score >= SEUIL_RISQUE_ELEVE) niveau = "élevé";
    else if (score >= SEUIL_RISQUE_MODERE) niveau = "modéré";

    const alerte = score >= SEUIL_ALERTE && signaux.length > 0;

    const resultat = Object.assign(base, {
      score,
      niveau,
      alerte,
      signaux,
      raisons,
      motifNonAlerte: alerte ? "" : `Score ${score}/100 sous le seuil de ${SEUIL_ALERTE}.`,
      decision: alerte
        ? `ALERTE ${niveau} — ${raisons.join(" + ")}`
        : `IGNORÉ — score insuffisant (${raisons.join(" + ") || "aucun signal"})`,
    });

    journaliser(resultat);
    return resultat;
  }

  // ---------------------------------------------------------------------------
  // Analyse principale
  // ---------------------------------------------------------------------------

  /**
   * Analyse un email et retourne un niveau de risque.
   *
   * @param {{nomAffiche: string, email: string, objet?: string, corps?: string}} emailData
   * @param {object} [contexte] Faits que le moteur ne peut pas établir seul
   *   (domaines du locataire, annuaire, authentification). Facultatif : sans
   *   lui le moteur rend exactement le même verdict qu'auparavant.
   */
  function analyserEmail(emailData, contexte) {
    const prep = preparer(emailData, contexte);

    // L'ordre compte pour la lisibilité des signaux, pas pour le score.
    const detecteurs = [detecterIdentite(prep)];

    return composer(prep, detecteurs);
  }

  // ---------------------------------------------------------------------------
  // API publique
  // ---------------------------------------------------------------------------

  global.SafentrepriseGuard = {
    SEUIL_ALERTE,
    SEUIL_RISQUE_MODERE,
    SEUIL_RISQUE_ELEVE,
    // Listes modifiables à chaud
    DOMAINES_DE_CONFIANCE,
    DOMAINES_GRAND_PUBLIC,
    DEMANDES_SENSIBLES,
    AMPLIFICATEURS,
    analyserEmail,
    estDomaineDeConfiance,
    reconnaitreNomDePersonne,
    extraireNomSignature,
    nomCorrespondALAdresse,
    formesDuNom,
    /** Active/désactive les logs console. */
    setDebug(valeur) {
      DEBUG = Boolean(valeur);
    },
    _interne: {
      normaliser,
      normaliserLigne,
      parserEmail,
      contientMotCle,
      decouperEnLignes,
      estFormuleCloture,
      nomEnContexteDestinataire,
      estDomaineGrandPublic,
    },
  };
})(typeof window !== "undefined" ? window : self);
