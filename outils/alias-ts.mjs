/**
 * Résout `@/…` pour les suites lancées directement par Node.
 *
 *   node --experimental-strip-types --import ./outils/alias-ts.mjs --test <suite>
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI CE CROCHET EXISTE.
 *
 *   Les suites du projet tournent sous `node --experimental-strip-types`, sans
 *   monter Next. Node ignore `paths` de tsconfig : un module qui écrit
 *   `@/lib/diagnostic` est donc introuvable pour lui.
 *
 *   La parade employée jusqu'ici était d'écrire les modules testés SANS AUCUNE
 *   IMPORTATION (`rapport-mensuel-html`, `alerte-dirigeant-texte`). Elle tient
 *   tant que le module est autonome. `diagnostic-email` ne peut pas l'être : il
 *   lui faut le barème, les textes et la grille tarifaire, qu'on ne va pas
 *   recopier pour les besoins du test — deux vérités destinées à diverger.
 *
 * ⚠ L'AUTRE VOIE ÉTAIT PIRE. Écrire `./diagnostic.ts` avec l'extension marche
 *   sous Node, mais le compilateur de Next la refuse : c'est exactement la
 *   raison pour laquelle `tsconfig.json` EXCLUT les `*.test.ts` du projet. Un
 *   module de production ne peut donc pas prendre cette forme.
 *
 * ⚠ CE FICHIER NE PART JAMAIS DANS LE BUNDLE. Il n'est chargé que par la
 *   ligne de commande des tests. Rien en production ne dépend de lui.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const SRC = path.resolve(import.meta.dirname, "..", "src");

/** Les extensions essayées, dans l'ordre. Aucune supposition au-delà. */
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts"];

function premierExistant(base) {
  for (const suffixe of EXTENSIONS) {
    const candidat = `${base}${suffixe}`;
    if (existsSync(candidat)) return candidat;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    /* ⚠ LES IMPORTS RELATIFS SANS EXTENSION ONT AUSSI BESOIN DE CE CROCHET.
       Les modules de production écrivent `./journal`, que Next résout et que
       Node refuse — ERR_MODULE_NOT_FOUND. Sans cette branche, tester un module
       revenait à n'en tester que les feuilles : `sante.ts` importe `graph.ts`,
       qui importe `./journal`, et la suite entière échouait à l'import. */
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      if (path.extname(specifier)) return nextResolve(specifier, context);
      const parent = context.parentURL;
      if (!parent?.startsWith("file:")) return nextResolve(specifier, context);

      const base = path.resolve(path.dirname(new URL(parent).pathname), specifier);
      const trouve = premierExistant(base);
      if (trouve) {
        return { url: pathToFileURL(trouve).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }

    if (!specifier.startsWith("@/")) {
      return nextResolve(specifier, context);
    }

    const base = path.join(SRC, specifier.slice(2));

    // ⚠ ON ESSAIE LES EXTENSIONS DANS L'ORDRE, sans deviner. Un chemin sans
    //   correspondance doit échouer bruyamment : une résolution approximative
    //   ferait passer un test sur un module qui n'est pas celui de production.
    for (const candidat of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidat)) {
        return { url: pathToFileURL(candidat).href, shortCircuit: true };
      }
    }

    throw new Error(`Alias « ${specifier} » introuvable sous ${SRC}`);
  },
});
