/**
 * Inventaire des données présentes en base, par société.
 * Sert à distinguer un problème d'affichage d'un problème de données.
 * Usage : node scripts/etat-donnees.mjs
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const connectionString = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((ligne) => ligne.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length)
  .trim();

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(`
  SELECT c.nom,
         c.id,
         c.user_id,
         (SELECT count(*) FROM employees e WHERE e.company_id = c.id) AS employes,
         (SELECT count(*) FROM campaigns k WHERE k.company_id = c.id) AS campagnes,
         (SELECT count(*) FROM risk_assessments r WHERE r.company_id = c.id) AS evaluations
    FROM companies c
   ORDER BY c.created_at
`);

for (const ligne of rows) {
  console.log(
    `${ligne.nom.padEnd(16)} employés=${ligne.employes}  campagnes=${ligne.campagnes}  évaluations=${ligne.evaluations}`,
  );
  console.log(`  company_id=${ligne.id}  user_id=${ligne.user_id}`);
}

const { rows: utilisateurs } = await client.query(
  `SELECT id, email FROM auth.users ORDER BY created_at`,
);

console.log("\nComptes :");
for (const u of utilisateurs) console.log(`  ${u.email}  ${u.id}`);

await client.end();
