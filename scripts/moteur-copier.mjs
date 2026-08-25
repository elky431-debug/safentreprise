/**
 * Copie le moteur de détection vers le repo de l'extension.
 *
 *   npm run moteur:copier
 *   npm run moteur:copier -- /chemin/vers/safentreprise-extension
 *
 * Sans argument, cherche « safentreprise-extension » à côté de ce repo.
 * Le contenu n'est pas transformé : seul un en-tête généré est ajouté
 * devant, pour que personne n'édite la copie en croyant éditer la source.
 */
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CHEMIN_DANS_EXTENSION,
  construireEntete,
  empreinte,
  lireSource,
  separerEntete,
  trouverExtension,
} from "./moteur-partage.mjs";

const extension = trouverExtension(process.argv[2]);

if (!existsSync(extension)) {
  console.error(`\n❌ Repo de l'extension introuvable : ${extension}`);
  console.error(
    "\n   Indique son chemin :" +
      "\n     npm run moteur:copier -- C:\\chemin\\vers\\safentreprise-extension" +
      "\n   ou pose la variable EXTENSION_PATH.",
  );
  process.exit(1);
}

const source = lireSource();
const destination = join(extension, CHEMIN_DANS_EXTENSION);

// État avant écriture, pour dire ce qui change réellement.
let etatPrecedent = "création";
if (existsSync(destination)) {
  const { corps } = separerEntete(readFileSync(destination, "utf8"));
  etatPrecedent = corps === source ? "déjà à jour" : "mise à jour";
}

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, construireEntete(source) + source);

console.log(`\n✓ Moteur copié — ${etatPrecedent}`);
console.log(`  Vers      : ${destination}`);
console.log(`  Empreinte : sha256:${empreinte(source).slice(0, 16)}…`);

if (etatPrecedent !== "déjà à jour") {
  console.log(
    `\n  Pense à commiter la copie dans le repo de l'extension.`,
  );
}
