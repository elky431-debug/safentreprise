/**
 * Contrôle rapide des colonnes ajoutées par les dernières évolutions du schéma
 * (onboarding + campagnes). Usage : node scripts/verifier-colonnes.mjs
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const connectionString =
  process.argv[2] ??
  process.env.DATABASE_URL ??
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((ligne) => ligne.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length)
    .trim();

// Colonnes indispensables au bon fonctionnement du code applicatif
const ATTENDU = {
  companies: [
    "nom",
    "secteur",
    "nom_responsable",
    "email_responsable",
    "telephone_responsable",
    "nom_dirigeant",
    "user_id",
    "mode_resultats",
    "employes_informes",
  ],
  risk_assessments: [
    "reponses",
    "score_procedures",
    "score_humain",
    "score_technique",
    "score_global",
  ],
  campaigns: ["nom", "type_fraude", "canal", "statut"],
  campaign_messages: ["type_fraude", "canal", "objet", "contenu", "ordre"],
  campaign_targets: ["message_id"],
};

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [Object.keys(ATTENDU)],
  );

  const presentes = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  let complet = true;

  for (const [table, colonnes] of Object.entries(ATTENDU)) {
    const manquantes = colonnes.filter((c) => !presentes.has(`${table}.${c}`));
    if (manquantes.length > 0) complet = false;

    console.log(
      `${table.padEnd(18)} ${manquantes.length === 0 ? "OK" : `MANQUE : ${manquantes.join(", ")}`}`,
    );
  }

  console.log(complet ? "\nToutes les colonnes attendues sont présentes." : "");
  if (!complet) process.exitCode = 1;
} catch (erreur) {
  console.error("Échec :", erreur.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
