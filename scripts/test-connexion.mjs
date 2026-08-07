/**
 * Teste une chaîne de connexion Postgres et affiche le résultat.
 * Utilitaire de diagnostic : n'exécute aucune modification.
 *
 * Usage : node scripts/test-connexion.mjs "postgresql://..."
 */
import { Client } from "pg";

const client = new Client({
  connectionString: process.argv[2],
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
  const { rows } = await client.query("SELECT current_user, current_database()");
  console.log(`  OK    -> ${rows[0].current_user} / ${rows[0].current_database}`);
  await client.end();
} catch (erreur) {
  console.log(`  ECHEC -> ${erreur.message}`);
}
