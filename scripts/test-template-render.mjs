/**
 * Prévisualise un gabarit après injection de variables (sans UI).
 *
 *   node scripts/test-template-render.mjs
 *   node scripts/test-template-render.mjs fournisseur email
 *   node scripts/test-template-render.mjs president sms
 */
import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

function lireEnvLocal(cle) {
  if (!existsSync(".env.local")) return undefined;
  for (const ligne of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separateur = ligne.indexOf("=");
    if (separateur === -1 || ligne.trimStart().startsWith("#")) continue;
    if (ligne.slice(0, separateur).trim() === cle) {
      return ligne
        .slice(separateur + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function injecter(gabarit, vars) {
  const logo = vars.logoUrl
    ? `<img src="${vars.logoUrl}" alt="${vars.entreprise}" width="148" />`
    : `<strong style="color:${vars.couleur}">${vars.entreprise}</strong>`;

  return gabarit
    .split("{logo}")
    .join(logo)
    .split("{entreprise}")
    .join(vars.entreprise)
    .split("{nom_dirigeant}")
    .join(vars.nomDirigeant)
    .split("{nom_fournisseur}")
    .join(vars.nomFournisseur)
    .split("{prenom_employe}")
    .join(vars.prenomEmploye)
    .split("{signature}")
    .join(vars.signatureHtml)
    .split("{couleur}")
    .join(vars.couleur);
}

const type = process.argv[2] ?? "president";
const canal = process.argv[3] ?? "email";
const connectionString =
  process.env.DATABASE_URL ?? lireEnvLocal("DATABASE_URL");

if (!connectionString) {
  console.error("DATABASE_URL manquante dans .env.local");
  process.exit(1);
}

const vars = {
  logoUrl: null,
  entreprise: "Jobump",
  nomDirigeant: "Alex Martin",
  nomFournisseur: "Dupont Logistique",
  prenomEmploye: "Camille",
  signatureHtml: "<p><strong>Alex Martin</strong><br />Direction</p>",
  couleur: "#0e8593",
};

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(
  `SELECT objet, contenu_html
     FROM message_templates
    WHERE type_fraude = $1 AND canal = $2 AND actif = true
    ORDER BY created_at ASC
    LIMIT 1`,
  [type, canal],
);

if (rows.length === 0) {
  console.error(`Aucun gabarit actif pour ${type} / ${canal}`);
  process.exitCode = 1;
} else {
  console.log(`Gabarit ${type} · ${canal}\n`);
  console.log("--- OBJET ---");
  console.log(rows[0].objet ? injecter(rows[0].objet, vars) : "(SMS)");
  console.log("\n--- APERÇU (500 car.) ---");
  const rendu = injecter(rows[0].contenu_html, vars);
  console.log(rendu.slice(0, 500));
  console.log(`\n… ${rendu.length} caractères au total`);
}

await client.end();
