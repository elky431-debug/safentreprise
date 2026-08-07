import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

function lireEnvLocal(cle) {
  if (!existsSync(".env.local")) return undefined;
  for (const ligne of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = ligne.indexOf("=");
    if (i === -1 || ligne.trimStart().startsWith("#")) continue;
    if (ligne.slice(0, i).trim() === cle) {
      return ligne.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

const client = new Client({
  connectionString: process.env.DATABASE_URL ?? lireEnvLocal("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const fns = await client.query(
  `SELECT proname FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN ('get_target_by_token','marquer_clic','marquer_signalement','enregistrer_quiz')
    ORDER BY 1`,
);
console.log("RPC:", fns.rows.map((r) => r.proname).join(", "));
const col = await client.query(
  `SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='campaign_targets' AND column_name='envoye_at'`,
);
console.log("envoye_at:", col.rowCount > 0 ? "OK" : "ABSENT");
await client.end();
