/**
 * Le TEXTE des alertes au dirigeant. Rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'ENTRE PAS DANS CES EMAILS, ET POURQUOI.
 *
 *   NI L'OBJET, NI LE CORPS DU MESSAGE FRAUDULEUX. Le dirigeant doit
 *   apprendre qu'une tentative a visé son entreprise ; il n'a pas à lire la
 *   correspondance de ses collaborateurs. La contrainte est ici, dans le type
 *   `AlerteANotifier` : il ne porte AUCUN champ d'objet ni de corps, et la
 *   fonction Postgres qui l'alimente n'en rend aucun. Ce n'est pas une
 *   consigne de rédaction, c'est une absence.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠ MODULE SANS AUCUNE IMPORTATION, ET IL DOIT LE RESTER. C'est ce qui le
 *   rend exécutable tel quel par `node --experimental-strip-types`, donc
 *   testable : les alias `@/` ne sont résolus que par le compilateur de Next.
 *   Les coordonnées et le lien vers la console lui sont PASSÉS plutôt
 *   qu'importés — `alerte-dirigeant.ts` les lui fournit depuis la source
 *   unique, `@/lib/contact`.
 */

/** Une ligne de `reclamer_notifications_alertes`. */
export type AlerteANotifier = {
  message_id: string;
  company_id: string;
  boite: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  nom_signe: string | null;
  employe_email: string | null;
  recu_at: string | null;
  analyse_at: string | null;
  niveau: string;
  score: number | null;
  signaux: string[] | null;
};

/** Une ligne de `reclamer_resumes_alertes`. */
export type ResumeANotifier = {
  company_id: string;
  nombre: number;
  depuis: string | null;
  lignes: {
    analyse_at: string | null;
    boite: string | null;
    expediteur_nom: string | null;
    expediteur_email: string | null;
    score: number | null;
  }[];
};

/** Ce que l'appelant fournit et que ce module n'a pas le droit d'importer. */
export type ContexteTexte = {
  telephone: string;
  email: string;
  /** Adresse complète de la page /menaces, ou une formule de repli. */
  lienMenaces: string;
};

/* ==========================================================================
   Dates
   ========================================================================== */

/**
 * ⚠ FUSEAU EXPLICITE. Le worker tourne sur une machine réglée en UTC ; sans
 *   `timeZone`, un message reçu à 9 h 30 serait annoncé à 7 h 30 au
 *   dirigeant, qui chercherait alors dans sa messagerie un message qui
 *   n'existe pas à cette heure-là.
 */
const FUSEAU = "Europe/Paris";

function formater(iso: string | null, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: FUSEAU }).format(d);
}

function dateLongue(iso: string | null): string {
  return formater(iso, { dateStyle: "full", timeStyle: "short" });
}

function dateCourte(iso: string | null): string {
  return formater(iso, { dateStyle: "short", timeStyle: "short" });
}

/* ==========================================================================
   L'expéditeur frauduleux
   ========================================================================== */

/**
 * L'expéditeur, tel qu'il s'est présenté et tel qu'il est réellement.
 *
 * ⚠ LES DEUX, JAMAIS L'UN SANS L'AUTRE. L'écart entre le nom affiché et
 *   l'adresse réelle EST la fraude dans la quasi-totalité des cas ; n'en
 *   montrer qu'une moitié priverait le dirigeant de ce qu'il a besoin de
 *   voir pour décider.
 */
export function expediteurLisible(
  nom: string | null,
  email: string | null,
  nomSigne?: string | null,
): string {
  const affiche = (nom ?? "").trim();
  const adresse = (email ?? "").trim();
  const signe = (nomSigne ?? "").trim();

  const base = affiche
    ? adresse
      ? `« ${affiche} » <${adresse}>`
      : `« ${affiche} »`
    : adresse || "expéditeur inconnu";

  // Le nom signé en bas du message ne figure que s'il diffère du nom affiché :
  // répéter deux fois la même chose fait douter de la lecture.
  return signe && signe.toLowerCase() !== affiche.toLowerCase()
    ? `${base}, signé « ${signe} »`
    : base;
}

/* ==========================================================================
   Les corps
   ========================================================================== */

/**
 * Pied commun aux deux emails.
 *
 * ⚠ LA PHRASE SUR L'OBJET ET LE CONTENU N'EST PAS DÉCORATIVE. Un dirigeant
 *   qui reçoit une alerte portant sur la boîte d'un collaborateur doit
 *   savoir, sans avoir à le demander, ce que ce produit lui montre et ce
 *   qu'il ne lui montrera jamais. C'est aussi ce que le collaborateur est en
 *   droit de savoir de son côté.
 */
function pied(c: ContexteTexte): string {
  return [
    "",
    "—",
    "Safentreprise — surveillance des tentatives de fraude par email.",
    "Ni l'objet ni le contenu des messages ne figurent dans cette alerte, et",
    "ne sont consultables nulle part dans le produit.",
    `Une question : ${c.telephone} — ${c.email}`,
  ].join("\n");
}

export function objetAlerte(): string {
  return "Safentreprise — tentative de fraude détectée";
}

export function objetResume(nombre: number): string {
  return nombre > 1
    ? `Safentreprise — ${nombre} tentatives de fraude détectées`
    : objetAlerte();
}

/** Au-delà, la liste des motifs cesse d'être lue. */
const MOTIFS_MAX = 5;

/**
 * Largeur de coupe, reprise de la bannière texte.
 *
 * ⚠ LES MOTIFS DU MOTEUR SONT DES PHRASES ENTIÈRES, souvent plus de cent
 *   cinquante caractères. Livrées en une seule ligne, elles sont repliées par
 *   le client de messagerie n'importe où — et la puce suivante se retrouve au
 *   milieu d'un paragraphe. On replie nous-mêmes, avec un retrait qui garde la
 *   liste lisible.
 */
const LARGEUR = 72;

/**
 * ⚠ LE PRÉFIXE EST PASSÉ À PART, IL N'EST PAS DANS LE TEXTE. Replier
 *   « ␣␣• Le message… » d'un bloc perdait les espaces de tête — `split(" ")`
 *   les rend comme des mots vides, et la puce se retrouvait collée à la
 *   marge. Séparer les deux permet aussi de compter le préfixe dans la
 *   largeur au lieu de le déborder.
 */
function replier(texte: string, prefixe: string, retrait: string): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = "";

  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length + retrait.length > LARGEUR && courante) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante) lignes.push(courante);

  return lignes.map((l, i) => (i === 0 ? prefixe : retrait) + l);
}

/**
 * Corps de l'alerte détaillée. Texte simple : il se lit aussi bien sur un
 * téléphone que dans un client texte, et rien n'y est mis en forme qui doive
 * l'être.
 */
export function corpsAlerte(a: AlerteANotifier, c: ContexteTexte): string {
  const motifs = (a.signaux ?? [])
    .map((s) => String(s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MOTIFS_MAX);

  const lignes = [
    "Une tentative de fraude à risque élevé vient d'être détectée sur l'une",
    "des boîtes que vous nous avez confiées.",
    "",
    `  Reçu le     : ${dateLongue(a.recu_at ?? a.analyse_at)}`,
    `  Boîte visée : ${a.boite ?? a.employe_email ?? "boîte inconnue"}`,
    `  Expéditeur  : ${expediteurLisible(a.expediteur_nom, a.expediteur_email, a.nom_signe)}`,
    `  Niveau      : élevé${a.score === null ? "" : ` (score ${a.score} sur 100)`}`,
  ];

  if (motifs.length > 0) {
    lignes.push("", "Ce qui a déclenché l'alerte :");
    for (const motif of motifs) {
      lignes.push(...replier(motif, "  • ", "    "));
    }
  }

  lignes.push(
    "",
    "Une bannière d'avertissement a été posée dans le message : votre",
    "collaborateur la voit en ouvrant sa messagerie.",
    "",
    "Ce qu'il faut faire :",
    "  Si un virement ou un changement de coordonnées bancaires est en cours,",
    "  vérifiez-le auprès de la personne concernée par un autre moyen —",
    "  téléphone, de vive voix — sans répondre à ce message et sans appeler",
    "  un numéro qui y figure.",
    "",
    `Le détail complet : ${c.lienMenaces}`,
    pied(c),
  );

  return lignes.join("\n");
}

/**
 * Corps du résumé.
 *
 * ⚠ IL NE DÉROULE PAS LES MOTIFS, ET C'EST CE QUI EN FAIT UN RÉSUMÉ. Sept
 *   alertes multipliées par cinq motifs donnent un mur de texte que personne
 *   ne lit — donc une alerte de moins, pas une de plus. Le détail intégral
 *   attend dans le tableau de bord, vers lequel l'email renvoie.
 *
 * ⚠ LE TOTAL EST TOUJOURS EXACT, MÊME QUAND LA LISTE EST TRONQUÉE. La base
 *   plafonne `lignes` à vingt entrées mais rend `nombre` entier : annoncer
 *   « 20 » à une entreprise qui en a reçu 57 serait le seul vrai défaut ici.
 */
export function corpsResume(r: ResumeANotifier, c: ContexteTexte): string {
  const detail = r.lignes ?? [];

  const lignes = [
    `${r.nombre} tentatives de fraude à risque élevé ont été détectées sur les`,
    `boîtes que vous nous avez confiées, depuis le ${dateCourte(r.depuis)}.`,
    "",
    "Chacune a reçu une bannière d'avertissement dans la messagerie du",
    "collaborateur concerné.",
    "",
    detail.length < r.nombre
      ? `Les ${detail.length} plus récentes :`
      : "Le détail :",
  ];

  for (const l of detail) {
    lignes.push(
      `  ${dateCourte(l.analyse_at)} — ${l.boite ?? "boîte inconnue"}`,
      `      ${expediteurLisible(l.expediteur_nom, l.expediteur_email)}` +
        `${l.score === null ? "" : ` — score ${l.score}`}`,
    );
  }

  lignes.push(
    "",
    "Un tel volume sur une seule période veut généralement dire que votre",
    "entreprise est visée nommément, et non balayée au hasard. Prévenez vos",
    "équipes comptables et vérifiez tout paiement en cours par un autre moyen.",
    "",
    `Le détail complet, motif par motif : ${c.lienMenaces}`,
    pied(c),
  );

  return lignes.join("\n");
}

/* ==========================================================================
   Essai
   ========================================================================== */

/**
 * Une alerte fabriquée, pour vérifier la chaîne d'envoi sans attendre une
 * vraie fraude. Aucune donnée réelle — voir `?essai-alerte=1` dans la route
 * du worker.
 */
export function alerteFictive(): AlerteANotifier {
  const maintenant = new Date().toISOString();
  return {
    message_id: "essai-sans-effet",
    company_id: "00000000-0000-0000-0000-000000000000",
    boite: "comptabilite@exemple-client.fr",
    expediteur_nom: "Marc Delaunay",
    expediteur_email: "m.delaunay.direction@gmail.com",
    nom_signe: "Marc Delaunay",
    employe_email: "comptabilite@exemple-client.fr",
    recu_at: maintenant,
    analyse_at: maintenant,
    niveau: "eleve",
    score: 92,
    signaux: [
      "Le message se présente au nom de « Marc Delaunay », qui figure à " +
        "l'annuaire de l'entreprise, mais il est envoyé depuis une adresse " +
        "extérieure (gmail.com).",
      "Le message demande un virement en insistant sur l'urgence et la " +
        "confidentialité.",
      "De nouvelles coordonnées bancaires sont annoncées dans le message.",
    ],
  };
}
