/**
 * Applique supabase/schema.sql sur la base Postgres distante.
 *
 * Le fichier est envoyé d'un seul bloc : contrairement à un copier-coller dans
 * un éditeur SQL, aucun découpage sur les points-virgules n'est possible, et
 * l'ensemble s'exécute dans une transaction implicite (tout ou rien).
 *
 * Usage :
 *   npm run db:apply                  (lit DATABASE_URL dans .env.local)
 *   node scripts/apply-schema.mjs "postgresql://user:motdepasse@hote:5432/postgres"
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

/** Lit une variable dans .env.local sans dépendance externe. */
function lireEnvLocal(cle) {
  if (!existsSync(".env.local")) return undefined;

  for (const ligne of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separateur = ligne.indexOf("=");
    if (separateur === -1 || ligne.trimStart().startsWith("#")) continue;

    if (ligne.slice(0, separateur).trim() === cle) {
      // Les guillemets éventuels autour de la valeur sont retirés
      return ligne
        .slice(separateur + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }

  return undefined;
}

const connectionString =
  process.argv[2] ?? process.env.DATABASE_URL ?? lireEnvLocal("DATABASE_URL");

if (!connectionString) {
  console.error(
    "Chaîne de connexion introuvable.\n\n" +
      "Ajoutez cette ligne à .env.local (Supabase > Project Settings >\n" +
      "Database > Connection string > URI, mode Session) :\n\n" +
      "  DATABASE_URL=postgresql://postgres.xxx:MOTDEPASSE@...pooler.supabase.com:5432/postgres\n\n" +
      "puis relancez : npm run db:apply",
  );
  process.exit(1);
}

const TABLES_ATTENDUES = [
  "companies",
  "employees",
  "branding",
  "suppliers",
  "message_templates",
  "quiz_questions",
  "campaigns",
  "campaign_messages",
  "campaign_targets",
  "payments",
  "certificates",
  "risk_assessments",
  "score_history",
];

const schema = readFileSync("supabase/schema.sql", "utf8");

// Supabase impose TLS ; le certificat est signé par une autorité interne.
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connexion établie.");

  await client.query(schema);
  console.log("Schéma appliqué.\n");

  // ---- Vérifications ----
  const { rows: tables } = await client.query(
    `SELECT tablename, rowsecurity
       FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename`,
    [TABLES_ATTENDUES],
  );

  const { rows: policies } = await client.query(
    `SELECT tablename, count(*)::int AS nombre
       FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1)
      GROUP BY tablename
      ORDER BY tablename`,
    [TABLES_ATTENDUES],
  );

  const politiquesParTable = new Map(
    policies.map(({ tablename, nombre }) => [tablename, nombre]),
  );

  console.log("Table                 RLS      Politiques");
  console.log("---------------------------------------------");

  let complet = true;
  for (const attendue of TABLES_ATTENDUES) {
    const table = tables.find((t) => t.tablename === attendue);
    const nombre = politiquesParTable.get(attendue) ?? 0;

    if (!table || !table.rowsecurity || nombre === 0) complet = false;

    const etatRls = table ? (table.rowsecurity ? "activée" : "DÉSACTIVÉE") : "—";
    console.log(
      `${attendue.padEnd(21)} ${etatRls.padEnd(8)} ${table ? nombre : "TABLE ABSENTE"}`,
    );
  }

  const { rows: fonction } = await client.query(
    `SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_my_company_id'`,
  );

  console.log(
    `\nFonction get_my_company_id : ${fonction.length > 0 ? "présente" : "ABSENTE"}`,
  );

  if (!complet || fonction.length === 0) {
    console.error("\nConfiguration incomplète.");
    process.exitCode = 1;
  } else {
    console.log("\nBase prête.");
  }
} catch (erreur) {
  console.error("Échec :", erreur.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
