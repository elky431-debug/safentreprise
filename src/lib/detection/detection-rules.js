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

  /**
   * CHANGEMENT DE COORDONNÉES BANCAIRES — le vocabulaire du basculement.
   *
   * Cette liste ne déclenche JAMAIS seule. Elle n'a de sens qu'en présence
   * d'un IBAN ou d'un RIB dont la clé de contrôle est vérifiée.
   *
   * ⚠ POURQUOI LA CONJONCTION EST OBLIGATOIRE : toute facture légitime porte
   *   un IBAN. Alerter sur « IBAN présent + expéditeur externe » reviendrait à
   *   alerter sur la totalité du courrier de facturation entrant. C'est
   *   l'annonce d'un CHANGEMENT qui distingue la fraude de la facture.
   *
   * ⚠ N'y ajoutez rien de générique (« à compter de ce jour », « dès à
   *   présent ») : ces tournures abondent dans les échanges légitimes et
   *   feraient basculer des factures ordinaires.
   */
  /**
   * Formulations qui parlent SANS AMBIGUÏTÉ d'un changement bancaire.
   *
   * Elles seules autorisent le chemin secondaire, celui où aucun IBAN n'est
   * présent dans le corps — parce que le nouveau RIB est en pièce jointe, ce
   * qui est le cas le plus fréquent dans la fraude au fournisseur réelle.
   *
   * Rien ici ne doit pouvoir désigner autre chose qu'un compte en banque :
   * « changement de coordonnées » tout court n'y a pas sa place, un
   * déménagement en produirait autant.
   */
  const CHANGEMENT_BANCAIRE_EXPLICITE = [
    "nouvelles coordonnees bancaires", "nouvelle coordonnee bancaire",
    "changement de coordonnees bancaires", "modification de coordonnees bancaires",
    "modification de nos coordonnees bancaires",
    "mise a jour de nos coordonnees bancaires",
    "mettre a jour vos informations bancaires",
    "coordonnees bancaires ont change", "coordonnees bancaires ont ete modifiees",
    "coordonnees bancaires ont ete mises a jour",
    "changement de banque", "changement d etablissement bancaire",
    "nouvel etablissement bancaire", "nouvelle domiciliation bancaire",
    "changement de domiciliation",
    "changement de rib", "changement d iban", "nouveau rib", "nouvel iban",
    "nouveau compte bancaire", "nouveau numero de compte",
    "ancien rib", "ancien iban", "ancienne banque",
    "bank details have changed", "new bank account", "updated bank details",
    "change of bank", "new bank details",
  ];

  /**
   * Formulations de changement qui ne suffisent PAS seules.
   *
   * Elles ne comptent qu'accompagnées d'un IBAN ou d'un RIB vérifié : hors de
   * ce contexte, elles désignent aussi bien un changement d'adresse ou de
   * référence client.
   */
  const CHANGEMENT_GENERIQUE = [
    "changement de coordonnees", "modification de nos coordonnees",
    "mise a jour de nos coordonnees", "mettre a jour nos coordonnees",
    // « base fournisseurs » seul est écarté : une facture peut mentionner sa
    // référence dans votre base sans rien changer du tout.
    "mettre a jour votre base fournisseurs", "mettre a jour votre base",
    "ancien compte", "notre precedent compte", "compte habituel",
    "ne plus utiliser", "n est plus valable", "n est plus valide",
    "ne sont plus valables", "ne sont plus valides",
  ];

  /** Vocabulaire complet du changement de coordonnées. */
  const CHANGEMENT_COORDONNEES = CHANGEMENT_BANCAIRE_EXPLICITE.concat(
    CHANGEMENT_GENERIQUE
  );

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
  // Analyse de domaine
  // ---------------------------------------------------------------------------

  /**
   * Suffixes publics à deux niveaux.
   *
   * Sans eux, « bbc.co.uk » donnerait le label « co » et se comparerait à
   * n'importe quel autre « co ». La liste n'est pas exhaustive — elle couvre
   * ce qu'un client français est susceptible de croiser.
   */
  const SUFFIXES_COMPOSES = [
    "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au",
    "co.jp", "co.nz", "com.br", "com.mx", "com.ar", "co.za", "com.tr",
    "com.cn", "com.hk", "com.sg", "co.in", "com.es", "com.pt", "com.pl",
    "gouv.fr", "asso.fr", "com.ua",
  ];

  /**
   * Label enregistrable d'un domaine : ce qui identifie vraiment l'entreprise.
   *
   *   safentreprise.fr            → safentreprise
   *   mail.safentreprise.co.uk    → safentreprise
   *
   * C'est LUI qu'il faut comparer, pas le domaine entier : « safentreprise.fr »
   * et « safentreprise.com » ne sont pas à distance 3 l'un de l'autre, ce sont
   * deux extensions de la même marque.
   */
  function labelEnregistrable(domaine) {
    const d = String(domaine || "").trim().toLowerCase().replace(/^\.|\.$/g, "");
    if (!d) return "";
    const parties = d.split(".");
    if (parties.length < 2) return d;

    const deuxDerniers = parties.slice(-2).join(".");
    const aRetirer = SUFFIXES_COMPOSES.indexOf(deuxDerniers) !== -1 ? 3 : 2;
    if (parties.length < aRetirer) return parties[0];
    return parties[parties.length - aRetirer];
  }

  /** Jetons d'un label : « safentreprlse-groupe » → [safentreprlse, groupe]. */
  function jetonsDeDomaine(label) {
    return String(label || "")
      .split(/[^a-z0-9]+/i)
      .filter((j) => j && j.length >= 3);
  }

  /**
   * Distance d'édition, bornée.
   *
   * Au-delà de `max` on s'arrête : deux domaines très différents n'ont aucun
   * intérêt, et la borne évite de calculer une matrice complète pour rien.
   */
  function distanceEdition(a, b, max) {
    const s = String(a || "");
    const t = String(b || "");
    if (s === t) return 0;
    if (Math.abs(s.length - t.length) > max) return max + 1;

    let precedente = new Array(t.length + 1);
    let courante = new Array(t.length + 1);
    for (let j = 0; j <= t.length; j += 1) precedente[j] = j;

    for (let i = 1; i <= s.length; i += 1) {
      courante[0] = i;
      let minLigne = i;
      for (let j = 1; j <= t.length; j += 1) {
        const cout = s[i - 1] === t[j - 1] ? 0 : 1;
        courante[j] = Math.min(
          precedente[j] + 1,
          courante[j - 1] + 1,
          precedente[j - 1] + cout
        );
        if (courante[j] < minLigne) minLigne = courante[j];
      }
      if (minLigne > max) return max + 1;
      const echange = precedente;
      precedente = courante;
      courante = echange;
    }
    return precedente[t.length];
  }

  /**
   * Distance maximale tolérée avant de crier au typosquattage.
   *
   * Elle dépend de la longueur : un label de quatre lettres est à distance 1
   * de dizaines de domaines réels sans le moindre rapport. En dessous de cinq
   * caractères, on ne conclut rien.
   */
  function distanceToleree(longueur) {
    if (longueur >= 8) return 2;
    if (longueur >= 5) return 1;
    return 0;
  }

  /**
   * Le domaine expéditeur imite-t-il l'un des domaines de l'entreprise ?
   *
   * Renvoie `null` quand il n'y a rien à dire — pas de contexte, ou domaine
   * reconnu. Sinon { genre, cible, jeton, distance }.
   *
   * Deux genres, délibérément inégaux :
   *
   *   « typosquat »  — une ou deux lettres d'écart (safentreprlse). Personne
   *                    ne possède légitimement un domaine qui diffère du sien
   *                    d'une lettre. Signal fort.
   *   « marque »     — la marque exacte dans un autre domaine
   *                    (safentreprise-groupe.com). Souvent frauduleux, mais
   *                    parfois le domaine marketing du client lui-même ou
   *                    celui de son routeur d'emailing. Signal modéré, et
   *                    c'est à ça que sert la liste blanche.
   */
  function analyserDomaineExpediteur(prep) {
    const c = prep.contexte;
    if (!c.fourni || c.domainesInternes.length === 0) return null;
    if (!prep.domaine) return null;

    // Domaine de l'entreprise, ou domaine tiers déclaré légitime : rien à dire.
    if (domaineDansListe(prep.domaine, c.domainesInternes)) return null;
    if (domaineDansListe(prep.domaine, c.domainesAutorises)) return null;

    const label = labelEnregistrable(prep.domaine);
    if (!label) return null;
    const jetons = [label].concat(jetonsDeDomaine(label));

    let meilleur = null;

    for (const interne of c.domainesInternes) {
      const cible = labelEnregistrable(interne);
      if (!cible || cible.length < 5) continue;

      for (const jeton of jetons) {
        if (jeton === cible) {
          // La marque exacte, dans un domaine qui n'est pas le vôtre.
          if (!meilleur) meilleur = { genre: "marque", cible, jeton, distance: 0 };
          continue;
        }
        const max = distanceToleree(Math.min(jeton.length, cible.length));
        if (max === 0) continue;
        const d = distanceEdition(jeton, cible, max);
        if (d >= 1 && d <= max) {
          // Un typosquat prime sur tout le reste.
          if (!meilleur || meilleur.genre !== "typosquat" || d < meilleur.distance) {
            meilleur = { genre: "typosquat", cible, jeton, distance: d };
          }
        }
      }
    }

    return meilleur;
  }

  /**
   * Le nom affiché correspond-il au DOMAINE de l'expéditeur ?
   *
   * « ATELIERS MERCIER » depuis compta@ateliers-mercier-sarl.fr : le domaine
   * porte le nom, l'expéditeur est cohérent. Sans cette règle, le moteur y
   * voyait une incohérence — deux mots capitalisés passent pour un nom de
   * personne, et « compta » ne ressemble pas à « Ateliers Mercier ». Une
   * facture parfaitement banale se retrouvait en « modéré ».
   *
   * On exige que TOUTES les parties significatives du nom figurent dans le
   * label. Une correspondance partielle ne suffit pas : « Yacine El Fahim »
   * depuis elfahim-consulting.fr ne contient pas « yacine », et reste donc
   * une incohérence à signaler.
   */
  function nomCorrespondAuDomaine(nom, domaine) {
    const label = labelEnregistrable(domaine).replace(/[^a-z0-9]/g, "");
    if (!label || !nom) return false;

    const parties = normaliser(nom)
      .split(" ")
      .filter((p) => p && !PARTICULES.has(p) && p.length >= 3);
    if (parties.length === 0) return false;

    return parties.every((p) => label.indexOf(p) !== -1);
  }

  // ---------------------------------------------------------------------------
  // Coordonnées bancaires
  // ---------------------------------------------------------------------------

  /**
   * Longueur exacte d'un IBAN par pays.
   *
   * La contrôler élimine la quasi-totalité des faux positifs : une suite de
   * caractères prise au hasard doit à la fois avoir la bonne longueur pour son
   * code pays ET satisfaire la clé modulo 97.
   */
  const LONGUEURS_IBAN = {
    AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
    BR: 29, CH: 21, CI: 28, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
    DZ: 26, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22,
    GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IS: 26,
    IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LI: 21, LT: 20, LU: 20, LV: 21,
    MA: 28, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18,
    NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24,
    SE: 24, SI: 19, SK: 24, SM: 27, SN: 28, TN: 24, TR: 26, UA: 29, VG: 24,
    XK: 20,
  };

  /** Modulo 97 par accumulation : évite tout débordement d'entier. */
  function modulo97(chiffres) {
    let reste = 0;
    for (let i = 0; i < chiffres.length; i += 1) {
      reste = (reste * 10 + Number(chiffres[i])) % 97;
    }
    return reste;
  }

  /**
   * IBAN valide ? Structure, longueur du pays, puis clé modulo 97 (ISO 13616).
   */
  function validerIban(candidat) {
    const s = String(candidat || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;

    const attendue = LONGUEURS_IBAN[s.slice(0, 2)];
    if (attendue === undefined) return false;
    if (s.length !== attendue) return false;

    // Les quatre premiers caractères passent à la fin, puis chaque lettre
    // devient un nombre (A=10 … Z=35). Le reste doit valoir 1.
    const reagence = s.slice(4) + s.slice(0, 4);
    let chiffres = "";
    for (let i = 0; i < reagence.length; i += 1) {
      const c = reagence[i];
      chiffres += c >= "0" && c <= "9" ? c : String(c.charCodeAt(0) - 55);
    }
    return modulo97(chiffres) === 1;
  }

  /**
   * IBAN présents dans un texte.
   *
   * On reconstruit à partir des suites alphanumériques plutôt qu'avec une
   * seule expression régulière : un IBAN s'écrit aussi bien d'un trait
   * (FR7630006000011234567890189) qu'en blocs de quatre séparés par des
   * espaces, des points ou des tirets. La validation de la clé arrête la
   * reconstruction au bon endroit.
   */
  function trouverIbans(texte) {
    const blocs = String(texte || "").toUpperCase().match(/[A-Z0-9]+/g) || [];
    const trouves = [];

    for (let i = 0; i < blocs.length; i += 1) {
      if (!/^[A-Z]{2}\d{2}/.test(blocs[i])) continue;
      let candidat = "";
      for (let j = i; j < blocs.length && candidat.length < 34; j += 1) {
        candidat += blocs[j];
        if (validerIban(candidat)) {
          if (trouves.indexOf(candidat) === -1) trouves.push(candidat);
          break;
        }
      }
    }
    return trouves;
  }

  /** Conversion des lettres pour la clé RIB française. */
  const RIB_LETTRES = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
    J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };

  /** Clé RIB française : 97 − (89×banque + 15×guichet + 3×compte) mod 97. */
  function validerRibFrancais(banque, guichet, compte, cle) {
    let compteChiffre = "";
    for (let i = 0; i < compte.length; i += 1) {
      const c = compte[i].toUpperCase();
      const v = RIB_LETTRES[c];
      compteChiffre += v === undefined ? c : String(v);
    }
    if (!/^\d+$/.test(compteChiffre)) return false;

    const reste =
      (89 * modulo97(banque) + 15 * modulo97(guichet) + 3 * modulo97(compteChiffre)) % 97;
    return (97 - reste) % 97 === Number(cle);
  }

  /**
   * RIB français au format classique (banque / guichet / compte / clé).
   *
   * On EXIGE la forme en blocs séparés. Une suite de 23 chiffres d'un seul
   * tenant est trop ambiguë : les factures regorgent de numéros de commande,
   * de SIRET et de références longues, et une clé sur 97 finirait par tomber
   * juste. La forme groupée, elle, ne s'écrit que pour un RIB.
   */
  function trouverRibsFrancais(texte) {
    const motif = /\b(\d{5})[ .\-]+(\d{5})[ .\-]+([A-Z0-9]{11})[ .\-]+(\d{2})\b/gi;
    const trouves = [];
    let m;
    while ((m = motif.exec(String(texte || ""))) !== null) {
      if (!validerRibFrancais(m[1], m[2], m[3], m[4])) continue;
      const compact = (m[1] + m[2] + m[3] + m[4]).toUpperCase();
      if (trouves.indexOf(compact) === -1) trouves.push(compact);
    }
    return trouves;
  }

  /**
   * Masque une coordonnée bancaire pour l'affichage et la journalisation.
   *
   * Les signaux sont CONSERVÉS EN BASE : y laisser un IBAN complet reviendrait
   * à stocker du contenu de message, ce que ce produit s'interdit. On n'en
   * garde que de quoi reconnaître de quoi on parle.
   */
  function masquerCompte(compact) {
    const s = String(compact || "");
    if (s.length <= 8) return s;
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }

  /** Le domaine relève-t-il de l'une des listes fournies ? */
  function domaineDansListe(domaine, liste) {
    const d = String(domaine || "").trim().toLowerCase().replace(/\.$/, "");
    if (!d) return false;
    return liste.some((entree) => {
      const e = String(entree || "").trim().toLowerCase().replace(/^@/, "");
      return e && (d === e || d.endsWith(`.${e}`));
    });
  }

  /**
   * L'expéditeur est-il externe à l'entreprise ?
   *
   * Trois états, et le troisième compte : `null` signifie « on n'en sait
   * rien », faute de contexte. Sans annuaire ni liste de domaines, le moteur
   * ne doit ni supposer externe ni supposer interne.
   */
  function expediteurExterne(prep) {
    const c = prep.contexte;
    if (!c.fourni || c.domainesInternes.length === 0) return null;
    if (domaineDansListe(prep.domaine, c.domainesInternes)) return false;
    if (domaineDansListe(prep.domaine, c.domainesAutorises)) return false;
    return true;
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

  /**
   * Ce qu'un détecteur verse au score commun.
   *
   * `remplace` liste les raisons d'AUTRES détecteurs que celui-ci rend
   * caduques, parce qu'il dit la même chose en mieux documenté. Sans ce
   * mécanisme, deux formulations du même fait s'additionnent et un message
   * franchit un seuil qu'il ne mérite pas — sur Outlook, où la bannière est
   * irréversible, c'est un mail légitime défiguré.
   */
  function apports(liste, remplace) {
    return { apports: liste, remplace: remplace || [] };
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

    const prep = {};
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

    Object.assign(prep, {
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
      // Texte NON normalisé : `normaliser` passe tout en minuscules, ce qui
      // rendrait un IBAN méconnaissable. La recherche de coordonnées bancaires
      // travaille donc sur l'original.
      texteBrut: `${objet}\n${corps}`,
      contexte: normaliserContexte(contexte),
    });

    // Calculé ici, et non dans le détecteur de domaine, parce que les DEUX
    // détecteurs en ont besoin : celui d'identité doit savoir qu'un domaine
    // est suspect avant d'accepter qu'il cautionne un nom (voir porte 4).
    prep.domaineSuspect = analyserDomaineExpediteur(prep);

    return prep;
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
    let sourceCoherence = null;
    for (const c of candidats) {
      if (nomCorrespondALAdresse(c.nom, local)) {
        candidatCoherent = c;
        sourceCoherence = "partie locale";
        break;
      }
    }

    // Le DOMAINE peut cautionner le nom tout autant que la partie locale.
    // « ATELIERS MERCIER » depuis compta@ateliers-mercier-sarl.fr est un
    // expéditeur cohérent : le domaine porte le nom. Sans cette règle, une
    // facture ordinaire ressortait en « modéré », parce que deux mots
    // capitalisés passent pour un nom de personne et que « compta » ne
    // ressemble à rien.
    //
    // ⚠ Sauf si le domaine est lui-même suspect. Un domaine typosquatté ne
    //   cautionne rien du tout — c'est précisément l'inverse.
    if (!candidatCoherent && !prep.domaineSuspect) {
      for (const c of candidats) {
        if (nomCorrespondAuDomaine(c.nom, domaine)) {
          candidatCoherent = c;
          sourceCoherence = "domaine";
          break;
        }
      }
    }

    // Un domaine que le client a lui-même déclaré — le sien, ou celui d'un
    // tiers légitime comme son routeur d'emailing — cautionne le nom.
    //
    // Sur ces domaines, l'incohérence nom ↔ partie locale ne dit rien :
    // « campagnes@ », « no-reply@ » et « contact@ » ne ressembleront jamais à
    // la signature, et une newsletter signée « L'équipe Safentreprise » se
    // ferait signaler indéfiniment.
    //
    // Cela ne désarme QUE ce détecteur. Un compte interne compromis qui
    // annonce un faux changement de RIB reste détecté : c'est un autre
    // détecteur, et il ne dépend pas de l'identification d'un nom.
    if (!candidatCoherent && !prep.domaineSuspect && prep.contexte.fourni) {
      const declare =
        domaineDansListe(domaine, prep.contexte.domainesInternes) ||
        domaineDansListe(domaine, prep.contexte.domainesAutorises);
      if (declare && candidats.length > 0) {
        candidatCoherent = candidats[0];
        sourceCoherence = "domaine declare";
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
        sourceCoherence === "domaine"
          ? `Le domaine « ${domaine} » porte le nom « ${candidatCoherent.nom} » ` +
            `— expéditeur cohérent.`
          : sourceCoherence === "domaine declare"
          ? `Le domaine « ${domaine} » est déclaré par l'entreprise — ` +
            `expéditeur cohérent.`
          : `L'adresse « ${local} » contient une forme reconnaissable de ` +
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
  // Détecteur — CHANGEMENT DE COORDONNÉES BANCAIRES
  // ---------------------------------------------------------------------------

  /**
   * Fraude au fournisseur : « nos coordonnées bancaires ont changé ».
   *
   * Ce détecteur ne dépend d'AUCUNE identification de nom. C'est tout son
   * intérêt : l'expéditeur signe « Comptabilité DELTA-LOG », qui n'est pas un
   * nom de personne, et le détecteur d'identité renonce. Avant le remaniement,
   * ce renoncement mettait fin à l'analyse et le message passait sans avoir
   * été examiné.
   *
   * Le déclenchement exige DEUX faits ensemble :
   *   1. une coordonnée bancaire dont la clé de contrôle est vérifiée ;
   *   2. l'annonce d'un changement.
   *
   * L'un sans l'autre ne dit rien : toute facture porte un IBAN, et « mise à
   * jour de nos coordonnées » sans coordonnée bancaire peut n'être qu'un
   * changement d'adresse.
   */
  function detecterChangementRib(prep, identite) {
    const comptes = trouverIbans(prep.texteBrut).concat(
      trouverRibsFrancais(prep.texteBrut)
    );

    const liste = [];

    if (comptes.length > 0) {
      const changements = motsClesPresents(
        prep.texteAnalyse,
        CHANGEMENT_COORDONNEES
      );

      if (changements.length === 0) {
        return abandon(
          "detecteur",
          "IGNORÉ — coordonnées bancaires sans changement annoncé",
          "Le message porte des coordonnées bancaires mais n'annonce aucun " +
            "changement : c'est le cas de toute facture."
        );
      }

      const masques = comptes.map(masquerCompte);
      prep.base.coordonneesBancaires = masques;
      prep.base.changementsAnnonces = changements;

      liste.push({
        // 55 : au-dessus du seuil « modéré », en dessous d'« élevé ». Une
        // entreprise change réellement de banque de temps en temps ; le
        // conseil « vérifiez par téléphone auprès d'un contact connu » reste
        // le bon même quand le changement est authentique.
        points: 55,
        raison: "changement_coordonnees_bancaires",
        signal:
          `Le message annonce un changement de coordonnées bancaires ` +
          `(${changements.slice(0, 3).join(", ")}) et fournit ${
            masques.length > 1 ? "des comptes" : "un compte"
          } : ${masques.join(", ")}.`,
      });
    } else {
      // CHEMIN SECONDAIRE — changement annoncé, coordonnées absentes du corps.
      //
      // C'est la forme la plus courante de la fraude au fournisseur réelle :
      // le message annonce le changement, le nouveau RIB est dans le PDF
      // joint. Exiger l'IBAN dans le texte reviendrait à ne rien voir.
      //
      // Le signal vaut moins (45, soit « à vérifier ») car il n'y a rien à
      // recouper : on ne peut pas confirmer qu'il s'agit bien d'un compte.
      // Seul le vocabulaire sans ambiguïté bancaire y donne droit.
      //
      // ⚠ PAS DE DOUBLE COMPTE. « nouveau rib », « nouvel iban », « changement
      //   de rib » figurent DÉJÀ dans DEMANDES_SENSIBLES, que le détecteur
      //   d'identité facture 25 points. Si celui-ci a parlé, la preuve est
      //   déjà au score et la recompter ici gonflerait artificiellement des
      //   messages que le moteur signalait correctement depuis toujours.
      //
      //   Ce chemin n'existe que pour les messages où le détecteur d'identité
      //   a renoncé — précisément le cas du fournisseur qui signe d'un nom de
      //   service et non d'un nom de personne.
      const identiteAParle =
        identite &&
        identite.apports &&
        identite.apports.some((a) => a.raison === "demande_sensible");

      if (identiteAParle) {
        return abandon(
          "detecteur",
          "IGNORÉ — changement bancaire déjà compté comme demande sensible",
          "Le détecteur d'identité a déjà retenu ce vocabulaire ; le compter " +
            "une seconde fois fausserait le score."
        );
      }

      const explicites = motsClesPresents(
        prep.texteAnalyse,
        CHANGEMENT_BANCAIRE_EXPLICITE
      );

      if (explicites.length === 0) {
        return abandon(
          "detecteur",
          "IGNORÉ — aucun changement de coordonnées bancaires",
          "Ni IBAN ni RIB vérifiable, et rien qui annonce sans ambiguïté un " +
            "changement bancaire."
        );
      }

      prep.base.changementsAnnonces = explicites;

      liste.push({
        points: 45,
        raison: "changement_bancaire_annonce",
        signal:
          `Le message annonce un changement bancaire ` +
          `(${explicites.slice(0, 3).join(", ")}) sans faire figurer de ` +
          `coordonnées vérifiables dans le corps — elles sont probablement ` +
          `en pièce jointe.`,
      });
    }

    // L'externalité ne peut qu'AJOUTER, jamais retrancher : un compte interne
    // compromis qui annonce un faux changement de RIB reste une fraude, et
    // c'en est même une particulièrement efficace.
    if (expediteurExterne(prep) === true) {
      liste.push({
        points: 10,
        raison: "expediteur_externe",
        signal:
          `L'expéditeur (${prep.domaine}) est extérieur à l'entreprise et à ` +
          `ses domaines autorisés.`,
      });
    }

    if (prep.amplificateurs.length > 0) {
      liste.push({
        // 20, et non 10 comme l'amplificateur générique du détecteur
        // d'identité : presser quelqu'un de changer OÙ VA L'ARGENT, en lui
        // demandant de n'en parler à personne, n'est pas de l'urgence
        // ordinaire. Avec le signal de base on atteint 75, soit « élevé ».
        // Une vraie notification de changement de banque annonce, elle ne
        // presse pas et ne demande pas le secret.
        points: 20,
        raison: "pression_changement_rib",
        signal:
          `Le changement s'accompagne d'une pression à l'urgence ou au ` +
          `secret : ${prep.amplificateurs.slice(0, 4).join(", ")}.`,
      });
    }

    return apports(liste);
  }

  // ---------------------------------------------------------------------------
  // Détecteur — DOMAINE ET ANNUAIRE
  // ---------------------------------------------------------------------------

  /** Ce détecteur a-t-il déjà retenu cette raison ? Sert à ne rien compter deux fois. */
  function aDejaRetenu(resultat, raison) {
    return Boolean(
      resultat &&
        resultat.apports &&
        resultat.apports.some((a) => a.raison === raison)
    );
  }

  /**
   * Deux noms désignent-ils la même personne ?
   *
   * Comparaison STRICTE des parties significatives, dans l'ordre. « Jean
   * Martin » ne doit pas correspondre à « Jean Martinez », ni « Martin » seul
   * à « Jean Martin » : sur un annuaire d'entreprise, une correspondance
   * approximative produirait des usurpations imaginaires en série.
   */
  function memePersonne(a, b) {
    const parties = (n) =>
      normaliser(n)
        .split(" ")
        .filter((p) => p && !PARTICULES.has(p) && p.length >= 2);
    const pa = parties(a);
    const pb = parties(b);
    if (pa.length < 2 || pa.length !== pb.length) return false;
    return pa.every((p, i) => p === pb[i]);
  }

  /**
   * Domaine imité, et identité d'annuaire usurpée.
   *
   * Ce détecteur ne fonctionne QU'AVEC un contexte : il compare le domaine
   * expéditeur aux domaines réels de l'entreprise, et le nom signé à
   * l'annuaire. Sans ces faits, il se tait — et le moteur se comporte comme
   * avant, ce que vérifient les seize cas de référence.
   *
   * Il lit `base.nomSignature` et `base.nomExpediteur`, renseignés par le
   * détecteur d'identité : celui-ci doit donc tourner en premier.
   */
  function detecterDomaine(prep, identite) {
    const c = prep.contexte;
    if (!c.fourni) {
      return abandon(
        "detecteur",
        "IGNORÉ — aucun contexte d'entreprise",
        "Ni domaines ni annuaire fournis : le domaine expéditeur n'est " +
          "comparable à rien."
      );
    }

    const liste = [];
    const suspect = prep.domaineSuspect;

    if (suspect && suspect.genre === "typosquat") {
      liste.push({
        // 75 = « élevé » à lui seul. C'est un fait vérifiable et sans
        // interprétation possible : personne ne possède légitimement un
        // domaine qui diffère du sien d'une lettre.
        points: 75,
        raison: "domaine_typosquatte",
        signal:
          `Le domaine expéditeur « ${prep.domaine} » imite « ${suspect.cible} », ` +
          `un domaine de l'entreprise, à ${suspect.distance} caractère` +
          `${suspect.distance > 1 ? "s" : ""} près.`,
      });
    } else if (suspect && suspect.genre === "marque") {
      liste.push({
        // 55 = « modéré ». Ici l'interprétation N'EST PAS univoque : un
        // domaine marketing, un routeur d'emailing ou une filiale portent
        // légitimement la marque. C'est à ça que sert la liste blanche, et
        // c'est pourquoi ce signal ne monte pas seul à « élevé ».
        points: 55,
        raison: "marque_dans_domaine_tiers",
        signal:
          `Le domaine expéditeur « ${prep.domaine} » reprend le nom ` +
          `« ${suspect.cible} » de l'entreprise sans être l'un de ses ` +
          `domaines déclarés.`,
      });
    }

    // — Usurpation d'une identité de l'annuaire —
    const nom = prep.base.nomSignature || prep.base.nomExpediteur;
    const externe = expediteurExterne(prep) === true;
    const remplace = [];

    if (nom && externe && c.annuaire.length > 0) {
      const personne = c.annuaire.find((p) => p && memePersonne(nom, p.nom));
      if (personne) {
        // « Se présente au nom d'une personne depuis une messagerie grand
        // public » redit, en moins précis, ce que dit l'usurpation d'annuaire.
        // Les additionner ferait passer à « élevé » un message sans la moindre
        // demande sensible — un salarié qui écrit depuis son adresse perso.
        remplace.push("domaine_grand_public");
        liste.push({
          // 55 = « modéré » seul, et pas davantage : le fait est vérifiable
          // mais son interprétation ne l'est pas. Les homonymes existent — le
          // « Jean Martin » qui écrit depuis un cabinet comptable n'est pas
          // celui de l'annuaire — et un dirigeant écrit parfois depuis son
          // adresse personnelle.
          points: 55,
          raison: "usurpation_identite_annuaire",
          signal:
            `Le message se présente au nom de « ${nom} », qui figure à ` +
            `l'annuaire de l'entreprise, mais il est envoyé depuis une ` +
            `adresse extérieure (${prep.email}).`,
        });

        // Ce qui fait passer à « élevé ». Sans demande sensible ni pression,
        // on en reste à « à vérifier ».
        if (
          prep.demandesSensibles.length > 0 &&
          !aDejaRetenu(identite, "demande_sensible")
        ) {
          liste.push({
            points: 20,
            raison: "demande_sensible",
            signal: `Demande d'action sensible détectée : ${prep.demandesSensibles
              .slice(0, 4)
              .join(", ")}.`,
          });
        } else if (
          prep.amplificateurs.length > 0 &&
          !aDejaRetenu(identite, "urgence_ou_secret")
        ) {
          liste.push({
            points: 20,
            raison: "urgence_ou_secret",
            signal:
              `Pression à l'urgence, au secret ou à l'indisponibilité : ` +
              `${prep.amplificateurs.slice(0, 4).join(", ")}.`,
          });
        }
      }
    }

    if (liste.length === 0) {
      return abandon(
        "detecteur",
        "IGNORÉ — domaine expéditeur sans anomalie",
        "Le domaine ne ressemble à aucun domaine de l'entreprise, et aucun " +
          "nom de l'annuaire n'est repris."
      );
    }

    return apports(liste, remplace);
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

    // Raisons rendues caduques par un détecteur mieux renseigné.
    const remplacees = new Set();
    for (const resultat of resultats) {
      for (const raison of resultat.remplace || []) remplacees.add(raison);
    }

    for (const resultat of resultats) {
      if (!resultat.apports) continue;
      for (const apport of resultat.apports) {
        // Un détecteur ne remplace jamais ses propres apports.
        if (
          remplacees.has(apport.raison) &&
          (resultat.remplace || []).indexOf(apport.raison) === -1
        ) {
          continue;
        }
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

    // L'ordre compte pour la lisibilité des signaux, pas pour le score — à une
    // exception près : le détecteur de RIB a besoin de savoir si celui
    // d'identité a déjà retenu le vocabulaire bancaire, pour ne pas le
    // compter deux fois.
    const identite = detecterIdentite(prep);
    const detecteurs = [
      identite,
      detecterChangementRib(prep, identite),
      detecterDomaine(prep, identite),
    ];

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
    CHANGEMENT_COORDONNEES,
    CHANGEMENT_BANCAIRE_EXPLICITE,
    analyserEmail,
    validerIban,
    trouverIbans,
    validerRibFrancais,
    trouverRibsFrancais,
    labelEnregistrable,
    nomCorrespondAuDomaine,
    distanceEdition,
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
