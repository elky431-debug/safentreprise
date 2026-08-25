/**
 * Fonctions communes aux scripts de partage du moteur de détection.
 *
 * PRINCIPE — la source de vérité est ici, dans le repo principal :
 *   src/lib/detection/detection-rules.js
 * L'extension Chrome en reçoit une COPIE, préfixée d'un en-tête généré.
 *
 * Pourquoi une copie et pas une compilation : le fichier doit rester une
 * fonction anonyme exécutée immédiatement, sans `import` ni `export`, parce
 * que Chrome charge les content scripts comme des scripts classiques. C'est
 * une contrainte à respecter en l'écrivant, pas à rattraper après coup.
 *
 * L'en-tête porte l'empreinte SHA-256 du corps. Elle permet deux
 * vérifications indépendantes :
 *   • côté extension, sans accès au repo principal : le corps correspond-il
 *     encore à l'empreinte annoncée ? Sinon, quelqu'un a édité la copie.
 *   • côté repo principal : la copie correspond-elle à la source actuelle ?
 *     Sinon, la source a bougé sans qu'on resynchronise.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** La source, dans ce repo. */
export const SOURCE = join(RACINE, "src/lib/detection/detection-rules.js");

/** Emplacement de la copie, à l'intérieur du repo de l'extension. */
export const CHEMIN_DANS_EXTENSION = "lib/detection-rules.js";

const DEBUT = "SAFENTREPRISE-ENTETE-GENEREE:DEBUT";
const FIN = "SAFENTREPRISE-ENTETE-GENEREE:FIN";

/**
 * Où se trouve le repo de l'extension.
 * Ordre : argument de ligne de commande, puis variable d'environnement,
 * puis dossier voisin — le cas courant quand les deux repos sont clonés
 * côte à côte.
 */
export function trouverExtension(argument) {
  const candidat =
    argument ||
    process.env.EXTENSION_PATH ||
    resolve(RACINE, "..", "safentreprise-extension");
  return resolve(candidat);
}

/** Empreinte d'un contenu, en-tête exclu. */
export function empreinte(contenu) {
  return createHash("sha256").update(contenu, "utf8").digest("hex");
}

/** Commit courant du repo principal, et si la source y est modifiée. */
export function etatGit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: RACINE,
      encoding: "utf8",
    }).trim();

    const modifie = execFileSync(
      "git",
      ["status", "--porcelain", "--", "src/lib/detection/detection-rules.js"],
      { cwd: RACINE, encoding: "utf8" },
    ).trim();

    return { commit, propre: modifie === "" };
  } catch {
    return { commit: "inconnu", propre: false };
  }
}

/** Construit l'en-tête apposé à la copie. */
export function construireEntete(contenuSource) {
  const { commit, propre } = etatGit();
  const date = new Date().toISOString().slice(0, 10);
  const mention = propre
    ? commit
    : `${commit} (source modifiée non commitée au moment de la copie)`;

  return [
    `/* ${DEBUT}`,
    ` *`,
    ` *   FICHIER GÉNÉRÉ — NE PAS MODIFIER ICI.`,
    ` *`,
    ` *   Toute correction se fait dans le repo principal, puis on relance la`,
    ` *   copie. Une modification faite directement dans ce fichier sera`,
    ` *   écrasée à la prochaine synchronisation, et le test`,
    ` *   tests/moteur-source.test.js la signalera avant.`,
    ` *`,
    ` *   Source     : safentreprise / src/lib/detection/detection-rules.js`,
    ` *   Commit     : ${mention}`,
    ` *   Copié le   : ${date}`,
    ` *   Empreinte  : sha256:${empreinte(contenuSource)}`,
    ` *`,
    ` *   Régénérer  : npm run moteur:copier   (depuis le repo principal)`,
    ` *`,
    ` * ${FIN} */`,
    "",
  ].join("\n");
}

/**
 * Sépare une copie en { entete, corps }.
 * `entete` vaut null si le fichier n'en porte pas — cas d'un fichier qui
 * n'est jamais passé par le script de copie.
 */
export function separerEntete(contenu) {
  if (!contenu.startsWith(`/* ${DEBUT}`)) {
    return { entete: null, corps: contenu };
  }

  const marqueur = `${FIN} */\n`;
  const position = contenu.indexOf(marqueur);
  if (position === -1) {
    return { entete: null, corps: contenu };
  }

  const coupe = position + marqueur.length;
  return { entete: contenu.slice(0, coupe), corps: contenu.slice(coupe) };
}

/** Lit l'empreinte annoncée dans un en-tête. */
export function empreinteAnnoncee(entete) {
  const trouve = entete?.match(/sha256:([0-9a-f]{64})/);
  return trouve ? trouve[1] : null;
}

/** Lit la source. Erreur explicite si elle a disparu. */
export function lireSource() {
  if (!existsSync(SOURCE)) {
    throw new Error(`Source introuvable : ${SOURCE}`);
  }
  return readFileSync(SOURCE, "utf8");
}
