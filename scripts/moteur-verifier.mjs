/**
 * Vérifie que la copie du moteur, côté extension, correspond à la source.
 *
 *   npm run moteur:verifier
 *   npm run moteur:verifier -- /chemin/vers/safentreprise-extension
 *
 * Sort en 1 si les deux fichiers divergent, en disant dans quel sens.
 *
 * Si le repo de l'extension n'est pas là, le script ne fait PAS échouer :
 * il le signale et s'arrête. Un poste ou une intégration continue qui ne
 * travaille que sur le site n'a aucune raison d'avoir l'extension à côté.
 * La vérification qui n'a pas besoin du repo principal vit de l'autre côté,
 * dans tests/moteur-source.test.js.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHEMIN_DANS_EXTENSION,
  empreinte,
  empreinteAnnoncee,
  lireSource,
  separerEntete,
  trouverExtension,
} from "./moteur-partage.mjs";

const extension = trouverExtension(process.argv[2]);
const destination = join(extension, CHEMIN_DANS_EXTENSION);

if (!existsSync(destination)) {
  console.log(
    `\n⊘ Repo de l'extension absent (${extension}) — vérification ignorée.`,
  );
  process.exit(0);
}

const source = lireSource();
const copie = readFileSync(destination, "utf8");
const { entete, corps } = separerEntete(copie);

const problemes = [];

if (!entete) {
  problemes.push(
    "La copie ne porte pas d'en-tête généré.\n" +
      "     → Elle n'est jamais passée par le script de copie, ou son en-tête a été supprimé.",
  );
} else {
  const annoncee = empreinteAnnoncee(entete);
  const reelle = empreinte(corps);
  if (annoncee && annoncee !== reelle) {
    problemes.push(
      "Le corps de la copie ne correspond plus à l'empreinte de son en-tête.\n" +
        "     → Quelqu'un a édité la copie à la main, du mauvais côté.\n" +
        `     → annoncée ${annoncee.slice(0, 16)}… / réelle ${reelle.slice(0, 16)}…`,
    );
  }
}

if (corps !== source) {
  const memeTaille = corps.length === source.length;
  problemes.push(
    "La copie diffère de la source.\n" +
      `     → source ${source.length} caractères, copie ${corps.length}` +
      (memeTaille ? " (même longueur, contenu différent)" : "") +
      "\n     → si la source est la bonne : npm run moteur:copier",
  );
}

if (problemes.length === 0) {
  console.log("\n✓ Copie conforme à la source.");
  console.log(`  ${destination}`);
  process.exit(0);
}

console.error("\n❌ Le moteur a divergé.\n");
for (const probleme of problemes) {
  console.error(`  • ${probleme}\n`);
}
console.error(`  Source : src/lib/detection/detection-rules.js`);
console.error(`  Copie  : ${destination}\n`);
process.exit(1);
