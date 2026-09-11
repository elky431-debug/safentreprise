/**
 * Le rapport mensuel : sujet, HTML, et version texte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL PROUVE. L'alerte prévient quand une tentative arrive ; ce rapport
 * prouve que la surveillance tourne — Y COMPRIS LES MOIS OÙ RIEN N'ARRIVE.
 * C'est le mois vide qui justifie l'envoi, pas le mois chargé.
 *
 * CE QU'IL NE CONTIENT PAS : aucun objet de message, aucun corps, aucune
 * adresse d'expéditeur frauduleux. Il est AGRÉGÉ. La contrainte est dans le
 * type `DonneesRapport` : il ne porte que des décomptes, et la fonction
 * Postgres qui l'alimente ne rend rien d'autre.
 *
 * L'adresse des BOÎTES visées y figure, comme dans l'alerte : savoir quel
 * poste est pris pour cible est ce qui permet de le protéger.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠ MODULE SANS AUCUNE IMPORTATION, ET IL DOIT LE RESTER — même raison que
 *   `alerte-dirigeant-texte` : c'est ce qui le rend exécutable par
 *   `node --experimental-strip-types`, donc testable. Les coordonnées et le
 *   lien vers la console lui sont passés.
 *
 * ⚠ STYLES EN LIGNE UNIQUEMENT, MISE EN PAGE EN TABLEAUX. Les clients de
 *   messagerie ignorent les feuilles de style et une bonne partie des
 *   sélecteurs ; Outlook ignore en plus flex et grid. Un `<div>` en colonnes
 *   s'y effondre en pile illisible.
 */

/* ==========================================================================
   Ce que la base rend
   ========================================================================== */

export type DonneesRapport = {
  /** Premier jour du mois couvert, « AAAA-MM-JJ ». */
  mois: string;
  societe: string | null;
  analyses: number;
  alertes: { eleve: number; modere: number; faible: number };
  boites_surveillees: number;
  employes: number;
  precedent:
    | { existe: false }
    | {
        existe: true;
        mois: string;
        analyses: number;
        eleve: number;
        modere: number;
        faible: number;
      };
  types: {
    usurpation: number;
    virement: number;
    coordonnees_bancaires: number;
    urgence: number;
  };
  boites_visees: { boite: string; alertes: number }[];
};

export type ContexteRapport = {
  telephone: string;
  email: string;
  /** Adresse complète de /menaces, ou une formule de repli. */
  lienMenaces: string;
};

/* ==========================================================================
   Charte
   ========================================================================== */

/**
 * ⚠ VALEURS OPAQUES, PAS LES `rgba()` DE `globals.css`. Plusieurs clients de
 *   messagerie — Outlook desktop en tête — ne gèrent pas l'alpha dans une
 *   couleur de fond : la teinte est alors ignorée et le bloc devient
 *   transparent. Ce sont donc les mêmes couleurs, composées sur blanc.
 *
 * ⚠ LE ROUGE EST RÉSERVÉ AUX CHIFFRES D'ALERTE. Ni les variations, ni les
 *   titres, ni les liens. Un rapport dont la moitié est rouge ne signale plus
 *   rien — c'est la même règle que les trois niveaux de bannière.
 */
const C = {
  fond: "#f6f7f8",
  carte: "#ffffff",
  marine: "#0f2444",
  encre: "#101828",
  ancre: "#17356b",
  ancreDoux: "#eff1f5",
  secondaire: "#4a5567",
  discret: "#6b7686",
  trait: "#e7e8e8",
  danger: "#c0392b",
  dangerDoux: "#faefee",
};

/* ==========================================================================
   Petits outils
   ========================================================================== */

/**
 * ⚠ TOUT CE QUI VIENT DE LA BASE EST ÉCHAPPÉ. Le nom d'une société et l'UPN
 *   d'une boîte sont saisis ailleurs ; un apostrophe ou un chevron y suffirait
 *   à casser le HTML, et une valeur malveillante à y injecter du balisage.
 */
export function echapper(texte: unknown): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ⚠ LE MOIS SE FORMATE EN UTC, SURTOUT PAS EN HEURE DE PARIS. « 2026-08-01 »
 *   est analysé comme minuit UTC ; formaté à Paris, il devient le 31 juillet
 *   à 22 h, et le rapport d'août s'intitulerait « juillet ». Tous les mois.
 */
export function nomDuMois(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "le mois écoulé";
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** « août » sans l'année, pour les phrases où elle alourdit. */
export function moisSeul(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ce mois-ci";
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return n <= 1 ? singulier : plurielForme;
}

/**
 * « d'août », « de septembre » — l'élision, qui n'est pas facultative.
 *
 * ⚠ TROIS MOIS COMMENCENT PAR UNE VOYELLE : avril, août, octobre. « de août »
 *   saute aux yeux dans un titre, et un client qui reçoit ça doute du reste.
 *   On teste la voyelle plutôt que d'énumérer, pour que le jour où la locale
 *   change la casse ou l'orthographe, la règle tienne encore.
 */
export function deMois(iso: string): string {
  const mois = moisSeul(iso);
  return /^[aeiouyàâéèêëîïôöûü]/i.test(mois) ? `d'${mois}` : `de ${mois}`;
}

/**
 * La variation, en clair.
 *
 * ⚠ AUCUN POURCENTAGE. Passer de 1 à 3 alertes fait « +200 % », ce qui est
 *   exact et trompeur : sur de si petits nombres, le pourcentage dramatise
 *   une variation qui tient au hasard. L'écart absolu, lui, se lit pour ce
 *   qu'il est.
 */
export function variation(actuel: number, precedent: number): string {
  const ecart = actuel - precedent;
  if (ecart === 0) return "stable";
  return ecart > 0 ? `+${ecart}` : `${ecart}`;
}

/* ==========================================================================
   La phrase de synthèse
   ========================================================================== */

/**
 * Trois cas, trois phrases. Elles sont la première chose lue, souvent la
 * seule — l'aperçu d'un client de messagerie n'en montre guère plus.
 *
 * ⚠ LE CAS « RIEN DU TOUT » NE DOIT PAS SONNER COMME UNE PANNE. « Aucune
 *   tentative détectée » seul laisse planer le doute sur ce qui a tourné.
 *   La seconde moitié de la phrase est ce qui distingue « rien ne s'est
 *   passé » de « rien n'a fonctionné ».
 */
export function synthese(d: DonneesRapport): string {
  const mois = moisSeul(d.mois);
  const { eleve, modere, faible } = d.alertes;

  if (eleve > 0) {
    return eleve === 1
      ? `1 tentative de fraude a visé votre entreprise en ${mois}.`
      : `${eleve} tentatives de fraude ont visé votre entreprise en ${mois}.`;
  }
  if (modere + faible > 0) {
    return "Aucune tentative caractérisée ce mois-ci. La surveillance reste active.";
  }
  return `Aucune tentative détectée en ${mois}. Vos boîtes ont été surveillées en continu.`;
}

/** Les quatre familles, dans l'ordre d'affichage. */
const FAMILLES: { cle: keyof DonneesRapport["types"]; libelle: string }[] = [
  { cle: "usurpation", libelle: "Usurpation d'identité" },
  { cle: "virement", libelle: "Demande de virement" },
  { cle: "coordonnees_bancaires", libelle: "Changement de coordonnées bancaires" },
  { cle: "urgence", libelle: "Pression à l'urgence" },
];

/* ==========================================================================
   HTML
   ========================================================================== */

function ligneChiffre(
  libelle: string,
  valeur: string,
  options: { alerte?: boolean; dernier?: boolean } = {},
): string {
  const bordure = options.dernier ? "none" : `1px solid ${C.trait}`;
  const couleur = options.alerte ? C.danger : C.encre;
  const graisse = options.alerte ? "700" : "600";
  return (
    `<tr>` +
    `<td style="padding:10px 0;border-bottom:${bordure};` +
    `font-size:14px;color:${C.secondaire};">${libelle}</td>` +
    // ⚠ `white-space:nowrap` N'EST PAS COSMÉTIQUE ICI. Sans lui, « 412 (+32) »
    //   se replie sur deux lignes quand le libellé est long, et une seule
    //   ligne du tableau se retrouve deux fois plus haute que ses voisines.
    `<td style="padding:10px 0;border-bottom:${bordure};text-align:right;` +
    `white-space:nowrap;font-size:16px;font-weight:${graisse};color:${couleur};` +
    `font-variant-numeric:tabular-nums;">${valeur}</td>` +
    `</tr>`
  );
}

function bloc(titre: string, contenu: string): string {
  return (
    `<tr><td style="padding:24px 28px 0 28px;">` +
    `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;` +
    `color:${C.discret};font-weight:600;margin-bottom:4px;">${titre}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `border="0" style="width:100%;border-collapse:collapse;">${contenu}</table>` +
    `</td></tr>`
  );
}

function texteSimple(contenu: string): string {
  return (
    `<tr><td style="padding:10px 0;font-size:14px;color:${C.secondaire};` +
    `line-height:1.55;">${contenu}</td></tr>`
  );
}

export function sujetRapport(d: DonneesRapport): string {
  return `Safentreprise — rapport de surveillance, ${nomDuMois(d.mois)}`;
}

export function htmlRapport(d: DonneesRapport, c: ContexteRapport): string {
  const { eleve, modere, faible } = d.alertes;
  const societe = echapper(d.societe ?? "votre entreprise");

  // ── Les chiffres du mois ────────────────────────────────────────────────
  const couverture =
    d.employes > 0
      ? `${d.boites_surveillees} sur ${d.employes}`
      : `${d.boites_surveillees}`;

  const chiffres =
    ligneChiffre("Messages analysés", String(d.analyses)) +
    ligneChiffre("Alertes de risque élevé", String(eleve), { alerte: eleve > 0 }) +
    ligneChiffre("Alertes de risque modéré", String(modere)) +
    ligneChiffre("Signaux de faible intensité", String(faible)) +
    ligneChiffre(
      d.employes > 0
        ? `Boîtes surveillées sur l'effectif déclaré`
        : "Boîtes surveillées",
      couverture,
      { dernier: true },
    );

  // ── L'évolution ─────────────────────────────────────────────────────────
  let evolution: string;
  if (!d.precedent.existe) {
    evolution = texteSimple(
      "C'est votre premier rapport : il n'y a pas encore de mois précédent " +
        "auquel comparer ces chiffres. Le prochain en portera l'évolution.",
    );
  } else {
    const p = d.precedent;
    evolution =
      ligneChiffre(
        "Messages analysés",
        `${d.analyses} &nbsp;<span style="font-weight:400;color:${C.discret};">(${variation(d.analyses, p.analyses)})</span>`,
      ) +
      ligneChiffre(
        "Risque élevé",
        `${eleve} &nbsp;<span style="font-weight:400;color:${C.discret};">(${variation(eleve, p.eleve)})</span>`,
      ) +
      ligneChiffre(
        "Risque modéré",
        `${modere} &nbsp;<span style="font-weight:400;color:${C.discret};">(${variation(modere, p.modere)})</span>`,
      ) +
      ligneChiffre(
        "Faible intensité",
        `${faible} &nbsp;<span style="font-weight:400;color:${C.discret};">(${variation(faible, p.faible)})</span>`,
        { dernier: true },
      ) +
      texteSimple(
        `Comparé à ${echapper(nomDuMois(p.mois))}. Le nombre de boîtes ` +
          `surveillées n'est pas comparé : seule sa valeur d'aujourd'hui est ` +
          `connue, l'historique n'en est pas conservé.`,
      );
  }

  // ── Les types de fraude ─────────────────────────────────────────────────
  const familles = FAMILLES.filter((f) => (d.types[f.cle] ?? 0) > 0);
  const types =
    familles.length === 0
      ? texteSimple("Aucun type de fraude caractérisé ce mois-ci.")
      : familles
          .map((f, i) =>
            ligneChiffre(f.libelle, String(d.types[f.cle]), {
              dernier: i === familles.length - 1,
            }),
          )
          .join("") +
        texteSimple(
          "Un même message peut relever de plusieurs types — une fraude au " +
            "président en combine généralement trois. Le total dépasse donc " +
            "le nombre d'alertes.",
        );

  // ── Les boîtes visées ───────────────────────────────────────────────────
  const visees = d.boites_visees ?? [];
  const boites =
    visees.length === 0
      ? texteSimple("Aucune boîte n'a reçu d'alerte ce mois-ci.")
      : visees
          .map((b, i) =>
            ligneChiffre(
              echapper(b.boite),
              `${b.alertes} ${pluriel(b.alertes, "alerte", "alertes")}`,
              { dernier: i === visees.length - 1 },
            ),
          )
          .join("");

  // ── L'assemblage ────────────────────────────────────────────────────────
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `border="0" style="width:100%;background:${C.fond};margin:0;padding:24px 0;">` +
    `<tr><td align="center" style="padding:0 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;background:${C.carte};` +
    `border:1px solid ${C.trait};border-radius:10px;overflow:hidden;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +

    // Bandeau
    `<tr><td style="background:${C.marine};padding:20px 28px;">` +
    `<div style="font-size:13px;font-weight:700;letter-spacing:0.04em;` +
    `color:#ffffff;">SAFENTREPRISE</div>` +
    `<div style="font-size:12px;color:#c3ccdb;margin-top:2px;">` +
    `Rapport de surveillance — ${echapper(nomDuMois(d.mois))}</div>` +
    `</td></tr>` +

    // Synthèse
    `<tr><td style="padding:28px 28px 4px 28px;">` +
    `<div style="font-size:13px;color:${C.discret};margin-bottom:10px;">` +
    `${societe}</div>` +
    `<div style="font-size:21px;line-height:1.35;font-weight:600;` +
    `color:${eleve > 0 ? C.danger : C.ancre};">${echapper(synthese(d))}</div>` +
    `</td></tr>` +

    // Un rappel du service rendu, précisément quand il ne s'est rien passé.
    (eleve === 0
      ? `<tr><td style="padding:14px 28px 0 28px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
        `border="0" style="width:100%;background:${C.ancreDoux};border-radius:8px;">` +
        `<tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;` +
        `color:${C.secondaire};">` +
        `${d.analyses} ${pluriel(d.analyses, "message a été analysé", "messages ont été analysés")} ` +
        `pendant le mois, sans qu'aucune tentative caractérisée ne passe. ` +
        `C'est le résultat attendu d'une surveillance qui fonctionne.` +
        `</td></tr></table></td></tr>`
      : `<tr><td style="padding:14px 28px 0 28px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
        `border="0" style="width:100%;background:${C.dangerDoux};border-radius:8px;">` +
        `<tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;` +
        `color:${C.secondaire};">` +
        `${pluriel(eleve, "Cette tentative a été signalée", "Ces tentatives ont été signalées")} ` +
        `par une bannière posée dans ${pluriel(eleve, "le message concerné", "les messages concernés")}, ` +
        `et vous ${pluriel(eleve, "en avez été prévenu par email", "en avez été prévenu par email")}.` +
        `</td></tr></table></td></tr>`) +

    bloc(`Les chiffres ${echapper(deMois(d.mois))}`, chiffres) +
    bloc("Évolution", evolution) +
    bloc("Types de fraude détectés", types) +
    bloc("Boîtes les plus visées", boites) +

    // Lien
    `<tr><td style="padding:26px 28px 4px 28px;">` +
    `<a href="${echapper(c.lienMenaces)}" ` +
    `style="display:inline-block;background:${C.ancre};color:#ffffff;` +
    `text-decoration:none;font-size:14px;font-weight:600;` +
    `padding:12px 20px;border-radius:6px;">Voir le détail des menaces</a>` +
    `</td></tr>` +

    // Pied
    `<tr><td style="padding:22px 28px 26px 28px;">` +
    `<div style="border-top:1px solid ${C.trait};padding-top:16px;` +
    `font-size:12px;line-height:1.6;color:${C.discret};">` +
    `Ce rapport est agrégé : il ne contient ni l'objet, ni le contenu, ni ` +
    `l'adresse d'expéditeur d'aucun message. Ces éléments ne sont ` +
    `consultables nulle part dans le produit.<br>` +
    `Une question : ${echapper(c.telephone)} — ` +
    `<a href="mailto:${echapper(c.email)}" style="color:${C.ancre};">` +
    `${echapper(c.email)}</a>` +
    `</div></td></tr>` +

    `</table></td></tr></table>`
  );
}

/* ==========================================================================
   Version texte
   ========================================================================== */

/**
 * ⚠ ELLE N'EST PAS DÉCORATIVE. Un email sans partie texte est noté plus
 *   sévèrement par les filtres anti-indésirables, et certains clients
 *   n'affichent que celle-ci. Elle porte les mêmes chiffres, dans le même
 *   ordre.
 */
export function texteRapport(d: DonneesRapport, c: ContexteRapport): string {
  const { eleve, modere, faible } = d.alertes;
  const l: string[] = [
    `SAFENTREPRISE — Rapport de surveillance, ${nomDuMois(d.mois)}`,
    d.societe ?? "",
    "",
    synthese(d),
    "",
    `LES CHIFFRES ${deMois(d.mois).toUpperCase()}`,
    `  Messages analysés             : ${d.analyses}`,
    `  Alertes de risque élevé       : ${eleve}`,
    `  Alertes de risque modéré      : ${modere}`,
    `  Signaux de faible intensité   : ${faible}`,
    d.employes > 0
      ? `  Boîtes surveillées            : ${d.boites_surveillees} sur ${d.employes} collaborateurs déclarés`
      : `  Boîtes surveillées            : ${d.boites_surveillees}`,
    "",
    "ÉVOLUTION",
  ];

  if (!d.precedent.existe) {
    l.push(
      "  C'est votre premier rapport : pas encore de mois précédent auquel",
      "  comparer. Le prochain en portera l'évolution.",
    );
  } else {
    const p = d.precedent;
    l.push(
      `  Messages analysés             : ${d.analyses} (${variation(d.analyses, p.analyses)})`,
      `  Risque élevé                  : ${eleve} (${variation(eleve, p.eleve)})`,
      `  Risque modéré                 : ${modere} (${variation(modere, p.modere)})`,
      `  Faible intensité              : ${faible} (${variation(faible, p.faible)})`,
      `  Comparé à ${nomDuMois(p.mois)}. Le nombre de boîtes surveillées n'est`,
      "  pas comparé : l'historique n'en est pas conservé.",
    );
  }

  l.push("", "TYPES DE FRAUDE DÉTECTÉS");
  const familles = FAMILLES.filter((f) => (d.types[f.cle] ?? 0) > 0);
  if (familles.length === 0) {
    l.push("  Aucun type de fraude caractérisé ce mois-ci.");
  } else {
    for (const f of familles) l.push(`  ${f.libelle} : ${d.types[f.cle]}`);
    l.push(
      "  Un même message peut relever de plusieurs types : le total dépasse",
      "  donc le nombre d'alertes.",
    );
  }

  l.push("", "BOÎTES LES PLUS VISÉES");
  const visees = d.boites_visees ?? [];
  if (visees.length === 0) {
    l.push("  Aucune boîte n'a reçu d'alerte ce mois-ci.");
  } else {
    for (const b of visees) {
      l.push(`  ${b.boite} : ${b.alertes} ${pluriel(b.alertes, "alerte", "alertes")}`);
    }
  }

  l.push(
    "",
    `Le détail des menaces : ${c.lienMenaces}`,
    "",
    "—",
    "Ce rapport est agrégé : il ne contient ni l'objet, ni le contenu, ni",
    "l'adresse d'expéditeur d'aucun message.",
    `Une question : ${c.telephone} — ${c.email}`,
  );

  return l.filter((ligne, i) => !(i === 1 && ligne === "")).join("\n");
}

/* ==========================================================================
   Essai
   ========================================================================== */

/**
 * Un rapport fabriqué, pour vérifier la chaîne d'envoi et le rendu sans
 * attendre le 1er du mois. Aucune donnée réelle — voir `?essai-rapport=1`
 * dans la route du worker.
 */
export function rapportFictif(): DonneesRapport {
  return {
    mois: "2026-08-01",
    societe: "Exemple Industrie",
    analyses: 412,
    alertes: { eleve: 3, modere: 7, faible: 12 },
    boites_surveillees: 4,
    employes: 12,
    precedent: {
      existe: true,
      mois: "2026-07-01",
      analyses: 380,
      eleve: 1,
      modere: 5,
      faible: 9,
    },
    types: {
      usurpation: 3,
      virement: 3,
      coordonnees_bancaires: 2,
      urgence: 4,
    },
    boites_visees: [
      { boite: "comptabilite@exemple-industrie.fr", alertes: 8 },
      { boite: "achats@exemple-industrie.fr", alertes: 3 },
      { boite: "direction@exemple-industrie.fr", alertes: 1 },
    ],
  };
}

/** La variante « mois calme » — celle qui justifie l'existence du rapport. */
export function rapportFictifCalme(): DonneesRapport {
  return {
    ...rapportFictif(),
    analyses: 356,
    alertes: { eleve: 0, modere: 0, faible: 0 },
    types: { usurpation: 0, virement: 0, coordonnees_bancaires: 0, urgence: 0 },
    boites_visees: [],
    precedent: {
      existe: true,
      mois: "2026-07-01",
      analyses: 380,
      eleve: 1,
      modere: 5,
      faible: 9,
    },
  };
}
