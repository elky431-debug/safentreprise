/**
 * Correspondants de confiance — la logique d'import, sans écran ni réseau.
 *
 * Le client exporte ses fournisseurs depuis son logiciel de comptabilité et
 * dépose le fichier. Sa structure est imprévisible : ce module prend des
 * lignes déjà lues, la correspondance de colonnes choisie par le client, et
 * rend ce qui sera enregistré — avec ce qui a été écarté, et pourquoi.
 *
 * ⚠ MODULE SANS AUCUNE IMPORTATION, ET IL DOIT LE RESTER. C'est ce qui le rend
 *   exécutable par `node --experimental-strip-types`, donc testable hors de
 *   Next. La lecture du fichier (Papaparse, SheetJS) vit à côté, dans
 *   `parse-tableur`, qui ne fait que produire des lignes.
 */

/* ==========================================================================
   Les domaines qu'on refuse de considérer comme de confiance
   ========================================================================== */

/**
 * ⚠ CETTE LISTE EXISTE EN TROIS EXEMPLAIRES, ET C'EST DÉLIBÉRÉ : ici, dans
 *   `detection-rules.js` (`DOMAINES_GRAND_PUBLIC`), et en base
 *   (`est_domaine_grand_public`, migration 20260922). Chacune protège un
 *   étage différent — l'écran, le moteur, la table — et aucune ne peut
 *   importer les autres : le moteur doit rester chargeable dans un
 *   navigateur, et la base ne lit pas de TypeScript.
 *
 *   Un essai compare celle-ci à celle du moteur. L'alignement avec la base se
 *   vérifie à la main : voir § 6 de la migration.
 *
 * ⚠ POURQUOI C'EST IMPORTANT. Un seul fournisseur déclaré sur gmail.com
 *   rendrait TOUT gmail.com légitime aux yeux de la règle « correspondant
 *   connu, domaine inhabituel » : le fraudeur qui se fait passer pour lui
 *   depuis une autre adresse Gmail passerait sans bruit. On désactiverait la
 *   détection sur le canal le plus utilisé par les fraudeurs, à l'endroit
 *   précis où on croit l'avoir renforcée.
 */
export const DOMAINES_GRAND_PUBLIC = [
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com",
  "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr",
  "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com",
  "mail.com", "gmx.com", "gmx.fr", "orange.fr", "wanadoo.fr", "free.fr",
  "laposte.net", "sfr.fr", "bbox.fr", "neuf.fr", "numericable.fr",
  "aliceadsl.fr", "club-internet.fr", "voila.fr", "yopmail.com",
];

const GRAND_PUBLIC = new Set(DOMAINES_GRAND_PUBLIC);

export function estDomaineGrandPublic(domaine: string): boolean {
  return GRAND_PUBLIC.has(domaine.trim().toLowerCase());
}

/** Forme d'un nom de domaine. Même expression qu'en base. */
const FORME_DOMAINE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Le domaine d'une valeur, qu'elle soit une adresse ou déjà un domaine.
 *
 * ⚠ LE CLIENT NE SAIT PAS TOUJOURS CE QU'IL EXPORTE. Une colonne « email »
 *   d'un logiciel de comptabilité contient des adresses ; une colonne
 *   « site web » contient des URL ; certaines contiennent déjà un domaine nu.
 *   Lui demander de trier serait lui demander de faire notre travail.
 */
export function domaineDe(valeur: string): string | null {
  let v = String(valeur ?? "").trim().toLowerCase();
  if (!v) return null;

  // Une URL : on ne garde que l'hôte.
  v = v.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
  // Une adresse : on ne garde que ce qui suit le dernier arobase.
  const arobase = v.lastIndexOf("@");
  if (arobase >= 0) v = v.slice(arobase + 1);
  // Un « www. » n'est pas un domaine différent.
  v = v.replace(/^www\./, "").replace(/\.$/, "");

  return FORME_DOMAINE.test(v) ? v : null;
}

/* ==========================================================================
   Le nom
   ========================================================================== */

/**
 * ⚠ MIROIR DE `normaliser_nom_correspondant` EN BASE ET DE `motsDuNom` DANS LE
 *   MOTEUR. Elle ne sert ici qu'à repérer les doublons AVANT l'envoi, pour
 *   pouvoir les annoncer dans l'aperçu. La base reste l'autorité : c'est sa
 *   colonne générée qui décide, et un écart entre les deux se traduirait par
 *   un aperçu optimiste, jamais par une écriture fausse.
 */
const FORMES_JURIDIQUES = new Set([
  "sarl", "sarlu", "sas", "sasu", "sa", "eurl", "sci", "scop", "snc", "gie",
  "eirl", "scm", "selarl", "ltd", "llc", "inc", "corp", "gmbh", "bv", "nv",
  "srl", "spa", "plc", "ag", "cie", "ets",
]);

export function normaliserNom(nom: string): string {
  const mots = String(nom ?? "")
    // Les acronymes pointés se recollent d'abord : « S.A.R.L. » → « sarl ».
    .replace(/\b([a-zA-Z])\./g, "$1")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const sansForme = mots.filter((m) => !FORMES_JURIDIQUES.has(m));
  return (sansForme.length > 0 ? sansForme : mots).join(" ");
}

/* ==========================================================================
   L'aperçu
   ========================================================================== */

export type LigneTableur = Record<string, string>;

export type Correspondance = {
  /** En-tête de la colonne qui porte le nom. */
  nom: string;
  /** En-tête de la colonne qui porte l'email ou le domaine. */
  domaine: string;
};

export type EntreeImport = {
  nom: string;
  domaines: string[];
  /** Lignes du fichier qui ont alimenté cette entrée (numérotées à partir de 1). */
  lignes: number[];
  /** Valeurs refusées, avec leur raison. */
  ecartes: { valeur: string; motif: string }[];
  /** Existe déjà côté serveur : l'import la complétera au lieu de la créer. */
  deja: boolean;
};

export type LigneRejetee = {
  ligne: number;
  valeur: string;
  motif: string;
};

export type ApercuImport = {
  entrees: EntreeImport[];
  rejets: LigneRejetee[];
  /** Nombre de lignes du fichier regroupées dans une entrée existante. */
  fusions: number;
  /** Domaines grand public rencontrés, pour l'avertissement en clair. */
  grandPublic: string[];
};

/**
 * Ce qui sera enregistré, à partir des lignes et de la correspondance choisie.
 *
 * ⚠ RIEN N'EST ENVOYÉ ICI. Cette fonction est pure : elle ne fait que dire ce
 *   qui se passerait. C'est ce qui permet d'afficher un aperçu fidèle avant
 *   d'écrire — et un client qui voit « 42 créés, 3 écartés » avant de valider
 *   ne découvre pas son fichier mal rangé après coup.
 *
 * ⚠ LES DOUBLONS SONT REGROUPÉS, PAS REJETÉS. Un export comptable liste une
 *   ligne par facture : le même fournisseur y revient vingt fois, parfois avec
 *   deux adresses différentes. Chaque ligne apporte donc un domaine de plus à
 *   la même entrée.
 */
export function construireApercu(
  lignes: LigneTableur[],
  correspondance: Correspondance,
  nomsExistants: string[] = [],
): ApercuImport {
  const existants = new Set(nomsExistants.map(normaliserNom).filter(Boolean));
  const parNom = new Map<string, EntreeImport>();
  const rejets: LigneRejetee[] = [];
  const grandPublic = new Set<string>();

  lignes.forEach((ligne, index) => {
    const numero = index + 1;
    const nom = String(ligne[correspondance.nom] ?? "").trim();
    const brut = String(ligne[correspondance.domaine] ?? "").trim();

    if (!nom) {
      // Une ligne sans nom n'est pas rejetée bruyamment si elle est vide de
      // partout : un export se termine souvent par des lignes fantômes.
      if (brut) rejets.push({ ligne: numero, valeur: brut, motif: "nom absent" });
      return;
    }

    const cle = normaliserNom(nom);
    if (!cle) {
      rejets.push({ ligne: numero, valeur: nom, motif: "nom illisible" });
      return;
    }

    let entree = parNom.get(cle);
    if (!entree) {
      entree = {
        nom,
        domaines: [],
        lignes: [],
        ecartes: [],
        deja: existants.has(cle),
      };
      parNom.set(cle, entree);
    }
    entree.lignes.push(numero);

    if (!brut) {
      entree.ecartes.push({ valeur: "(vide)", motif: "aucun domaine" });
      return;
    }

    // Une cellule peut contenir plusieurs adresses séparées par ; ou ,
    for (const morceau of brut.split(/[;,\s]+/).filter(Boolean)) {
      const domaine = domaineDe(morceau);
      if (!domaine) {
        entree.ecartes.push({ valeur: morceau, motif: "domaine illisible" });
        continue;
      }
      if (estDomaineGrandPublic(domaine)) {
        grandPublic.add(domaine);
        entree.ecartes.push({
          valeur: domaine,
          motif: "messagerie grand public",
        });
        continue;
      }
      if (!entree.domaines.includes(domaine)) entree.domaines.push(domaine);
    }
  });

  const entrees: EntreeImport[] = [];
  for (const entree of parNom.values()) {
    if (entree.domaines.length === 0) {
      rejets.push({
        ligne: entree.lignes[0] ?? 0,
        valeur: entree.nom,
        motif:
          entree.ecartes.some((e) => e.motif === "messagerie grand public")
            ? "aucun domaine utilisable (messagerie grand public)"
            : "aucun domaine utilisable",
      });
      continue;
    }
    entrees.push(entree);
  }

  entrees.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return {
    entrees,
    rejets,
    fusions: entrees.filter((e) => e.deja).length,
    grandPublic: [...grandPublic].sort(),
  };
}

/**
 * Devine les deux colonnes, pour que le client n'ait qu'à corriger.
 *
 * ⚠ UNE PROPOSITION, JAMAIS UNE DÉCISION. L'écran affiche toujours les deux
 *   listes déroulantes, même quand la devinette est bonne : un fichier dont
 *   les colonnes s'appellent « Tiers » et « Contact » serait importé de
 *   travers sans que personne ne le voie.
 */
export function devinerCorrespondance(entetes: string[]): Correspondance {
  const rangee = (mots: string[]) =>
    entetes.find((e) => {
      const n = e.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return mots.some((m) => n.includes(m));
    });

  return {
    nom:
      rangee(["raison sociale", "fournisseur", "tiers", "societe", "nom", "name", "client"]) ??
      entetes[0] ??
      "",
    domaine:
      rangee(["email", "e-mail", "mail", "courriel", "domaine", "domain", "site"]) ??
      entetes[1] ??
      "",
  };
}
