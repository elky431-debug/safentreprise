/**
 * Compare les deux façons de compter des lignes via l'API Supabase :
 * requête HEAD (head: true) et requête GET, toutes deux avec Prefer: count=exact.
 * Usage : node scripts/test-comptage.mjs
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((ligne) => ligne.includes("="))
    .map((ligne) => [
      ligne.slice(0, ligne.indexOf("=")).trim(),
      ligne.slice(ligne.indexOf("=") + 1).trim(),
    ]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Session d'un vrai utilisateur : le RLS doit s'appliquer comme dans l'app
const connexion = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: cle, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "demo@safentreprise.com",
    password: "DemoSaf2026!",
  }),
});

const { access_token: jeton } = await connexion.json();

if (!jeton) {
  console.error("Connexion impossible.");
  process.exit(1);
}

const entetes = {
  apikey: cle,
  Authorization: `Bearer ${jeton}`,
  Prefer: "count=exact",
};

for (const table of ["employees", "campaigns"]) {
  for (const methode of ["HEAD", "GET"]) {
    const reponse = await fetch(`${url}/rest/v1/${table}?select=id`, {
      method: methode,
      headers: entetes,
    });

    console.log(
      `${table.padEnd(10)} ${methode.padEnd(5)} statut=${reponse.status} content-range=${reponse.headers.get("content-range") ?? "ABSENT"}`,
    );
  }
}
