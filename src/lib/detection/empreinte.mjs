/**
 * Empreinte complète de la sortie du moteur sur les 16 cas de référence.
 *
 * Le test `detection-rules.test.js` ne compare que le niveau retenu. C'est ce
 * qui compte pour l'utilisateur, mais c'est insuffisant pour un remaniement :
 * on peut casser un score, un libellé de signal ou un motif de non-alerte sans
 * qu'un seul cas change de niveau.
 *
 * Ce script sérialise TOUT ce que renvoie le moteur, cas par cas, et compare
 * à une empreinte de référence versionnée :
 *
 *   npm run moteur:empreinte              vérifie (échoue si un écart)
 *   npm run moteur:empreinte -- --ecrire  régénère la référence
 *
 * Les 16 cas encodent le calibrage anti-faux-positif. Ils ne doivent PAS
 * bouger quand on ajoute un détecteur : aucun d'eux ne fournit de contexte, et
 * le moteur sans contexte doit rendre le même verdict qu'au premier jour. Un
 * écart n'est pas forcément un bug, mais il doit être regardé et assumé, pas
 * découvert trois étapes plus tard.
 *
 * Ne régénérer la référence qu'après avoir justifié chaque ligne du diff.
 *
 * Les cas sont importés du fichier de test : une seule source de vérité.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ici = dirname(fileURLToPath(import.meta.url));

globalThis.self = globalThis;
createRequire(import.meta.url)("./detection-rules.js");
const SG = globalThis.self.SafentrepriseGuard;
SG.setDebug(false);

// Les cas vivent dans le fichier de test, qui n'exporte rien (il s'exécute).
// On en extrait le tableau CAS sans le lancer.
const source = readFileSync(join(ici, "detection-rules.test.js"), "utf8");
const debut = source.indexOf("const CAS = [");
const fin = source.indexOf("\n];", debut);
if (debut === -1 || fin === -1) {
  throw new Error("Tableau CAS introuvable dans detection-rules.test.js");
}
const CAS = new Function(source.slice(debut, fin + 3) + "\nreturn CAS;")();

/** Sérialisation stable : clés triées, pour que le diff soit lisible. */
function stable(valeur) {
  if (Array.isArray(valeur)) return valeur.map(stable);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.keys(valeur)
        .sort()
        .map((c) => [c, stable(valeur[c])]),
    );
  }
  return valeur;
}

const lignes = [`# Empreinte du moteur — ${CAS.length} cas de référence`];

for (const cas of CAS) {
  // Volontairement SANS contexte : c'est la garantie que le moteur nu, celui
  // qu'un adaptateur sans annuaire ni en-têtes utilisera, reste inchangé.
  const r = SG.analyserEmail(cas.data);
  lignes.push(
    "",
    "=".repeat(78),
    cas.titre,
    `attendu: ${cas.attendu ?? "aucune"}`,
    "=".repeat(78),
    JSON.stringify(stable(r), null, 2),
  );
}

const empreinte = lignes.join("\n") + "\n";
const reference = join(ici, "empreinte-reference.txt");

if (process.argv.includes("--ecrire")) {
  writeFileSync(reference, empreinte);
  console.log(`Empreinte de référence écrite : ${reference}`);
  console.log(`${CAS.length} cas.`);
  process.exit(0);
}

if (!existsSync(reference)) {
  console.error(
    `Aucune empreinte de référence. La créer avec :\n` +
      `  npm run moteur:empreinte -- --ecrire`,
  );
  process.exit(1);
}

const attendue = readFileSync(reference, "utf8");

if (attendue === empreinte) {
  console.log(`\n  ${CAS.length}/${CAS.length} cas — empreinte identique à la référence\n`);
  process.exit(0);
}

// Diff ligne à ligne, pour pointer l'écart sans dépendance externe.
const a = attendue.split("\n");
const b = empreinte.split("\n");
let contexteCourant = "";
let ecarts = 0;

console.error("\n  ÉCART AVEC L'EMPREINTE DE RÉFÉRENCE\n");
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i] !== undefined && a[i].startsWith("attendu:")) contexteCourant = a[i - 1];
  if (a[i] === b[i]) continue;
  ecarts += 1;
  if (ecarts > 40) {
    console.error("  … (écarts suivants tronqués)");
    break;
  }
  console.error(`  ${contexteCourant}`);
  console.error(`    ligne ${i + 1}`);
  console.error(`      référence : ${a[i] ?? "(absente)"}`);
  console.error(`      obtenue   : ${b[i] ?? "(absente)"}`);
}

console.error(
  `\n  Si l'écart est voulu, le justifier puis régénérer :\n` +
    `    npm run moteur:empreinte -- --ecrire\n`,
);
process.exit(1);
