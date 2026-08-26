/**
 * ANNULE tout ce que Safentreprise a posé dans les boîtes : bannières et
 * catégories.
 *
 *   npm run graph:restaurer -- --essai      montre ce qui serait fait, sans agir
 *   npm run graph:restaurer                 restaure tout
 *   npm run graph:restaurer -- --message ID restaure un seul message
 *
 * COMMENT ÇA MARCHE SANS SAUVEGARDE. Le corps d'origine n'est stocké nulle
 * part — ce serait conserver du contenu de message. La bannière est encadrée
 * par deux marqueurs, et la restauration est une DÉCOUPE : on relit le corps
 * actuel, on retire ce qui se trouve entre les marqueurs, on réécrit. Ce qui
 * reste est le corps d'origine au caractère près.
 *
 * Si les marqueurs ont disparu, le retrait retombe sur la balise repère de la
 * bannière. Si NI l'un NI l'autre n'est trouvé, le script ne touche pas au
 * corps et le signale : il vaut mieux une bannière qui reste qu'un message
 * découpé au mauvais endroit.
 *
 * Ce script est sûr à relancer : restaurer un message déjà restauré ne fait
 * rien.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

for (const ligne of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { MS_CLIENT_ID, MS_CLIENT_SECRET, DATABASE_URL } = process.env;
const manquantes = Object.entries({ MS_CLIENT_ID, MS_CLIENT_SECRET, DATABASE_URL })
  .filter(([, v]) => !v).map(([k]) => k);
if (manquantes.length) {
  console.error(`\n❌ Variables absentes de .env.local :\n   ${manquantes.join("\n   ")}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const ESSAI = args.includes("--essai");
const UN_MESSAGE = args.includes("--message")
  ? args[args.indexOf("--message") + 1]
  : null;

// —————————————————————— Marqueurs (miroir de banniere.ts) ——————————————————————

const MARQUEUR_DEBUT = "<!--SAFENTREPRISE-BANNIERE:DEBUT-->";
const MARQUEUR_FIN = "<!--SAFENTREPRISE-BANNIERE:FIN-->";

const ENTRE_MARQUEURS = new RegExp(`${MARQUEUR_DEBUT}[\\s\\S]*?${MARQUEUR_FIN}`, "g");
const DIV_REPERE =
  /<div[^>]*\sdata-safentreprise\s*=\s*["']?banniere["']?[^>]*>[\s\S]*?<\/div>/gi;

/** Miroir exact de retirerBanniere() — voir src/lib/microsoft/banniere.ts. */
function retirerBanniere(html) {
  const source = String(html ?? "");
  if (ENTRE_MARQUEURS.test(source)) {
    ENTRE_MARQUEURS.lastIndex = 0;
    const n = source.match(ENTRE_MARQUEURS)?.length ?? 0;
    return { html: source.replace(ENTRE_MARQUEURS, ""), retirees: n, methode: "marqueurs" };
  }
  ENTRE_MARQUEURS.lastIndex = 0;
  if (DIV_REPERE.test(source)) {
    DIV_REPERE.lastIndex = 0;
    const n = source.match(DIV_REPERE)?.length ?? 0;
    return { html: source.replace(DIV_REPERE, ""), retirees: n, methode: "attribut" };
  }
  DIV_REPERE.lastIndex = 0;
  return { html: source, retirees: 0, methode: "aucune" };
}

const NOMS_CATEGORIES = [
  "Safentreprise — Risque élevé",
  "Safentreprise — Suspect",
  "Safentreprise — À vérifier",
];

// —————————————————————————— Graph ——————————————————————————

const jetons = new Map();

async function jeton(tenantId) {
  if (jetons.has(tenantId)) return jetons.get(tenantId);
  const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) {
    throw new Error(`Authentification refusée : ${d.error_description ?? d.error ?? r.status}`);
  }
  jetons.set(tenantId, d.access_token);
  return d.access_token;
}

async function graph(tenantId, methode, chemin, corps) {
  const acces = await jeton(tenantId);
  const r = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${acces}`,
      ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  if (r.status === 204) return null;
  const texte = await r.text();
  const d = texte ? JSON.parse(texte) : null;
  if (!r.ok) {
    throw new Error(`${methode} ${chemin} → ${r.status} ${d?.error?.code ?? ""} ${d?.error?.message ?? ""}`);
  }
  return d;
}

// —————————————————————————— Exécution ——————————————————————————

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: cibles } = await db.query(
  "SELECT * FROM messages_a_restaurer($1, $2)",
  [null, UN_MESSAGE],
);

console.log(
  ESSAI
    ? "\n  ESSAI À BLANC — rien ne sera modifié\n"
    : "\n  RESTAURATION\n",
);

if (cibles.length === 0) {
  console.log("  Rien à défaire : aucun message ne porte de bannière ni de catégorie.\n");
  await db.end();
  process.exit(0);
}

console.log(`  ${cibles.length} message(s) à traiter\n`);

let restaures = 0;
let intacts = 0;
let echecs = 0;

for (const cible of cibles) {
  const court = cible.message_id.slice(0, 22) + "…";
  const objet = (cible.objet ?? "(sans objet)").slice(0, 45);

  try {
    const boite = encodeURIComponent(cible.graph_user_id);
    const message = encodeURIComponent(cible.message_id);

    const actuel = await graph(
      cible.tenant_id, "GET",
      `/users/${boite}/messages/${message}?$select=id,categories,body`,
    );

    const corps = actuel?.body?.content ?? "";
    const retrait = retirerBanniere(corps);

    const categoriesRestantes = (actuel?.categories ?? []).filter(
      (c) => !NOMS_CATEGORIES.includes(c),
    );
    const categoriesARetirer = (actuel?.categories ?? []).length - categoriesRestantes.length;

    if (retrait.retirees === 0 && categoriesARetirer === 0) {
      console.log(`  ○ ${court}  ${objet}\n      rien à retirer`);
      if (!ESSAI) {
        await db.query("SELECT marquer_restauration_graph($1, $2)", [
          cible.company_id, cible.message_id,
        ]);
      }
      intacts += 1;
      continue;
    }

    // La bannière était annoncée mais reste introuvable : on NE TOUCHE PAS au
    // corps. Découper au jugé ferait bien plus de dégâts que de laisser la
    // bannière en place.
    if (cible.banniere_posee && retrait.retirees === 0) {
      console.log(
        `  ⚠ ${court}  ${objet}\n` +
          `      bannière annoncée mais introuvable — corps NON modifié.\n` +
          `      Les marqueurs ont probablement été retirés par le client de messagerie.`,
      );
      echecs += 1;
      continue;
    }

    if (ESSAI) {
      console.log(
        `  → ${court}  ${objet}\n` +
          `      bannière : ${retrait.retirees} (par ${retrait.methode}), ` +
          `catégorie(s) : ${categoriesARetirer}`,
      );
      restaures += 1;
      continue;
    }

    if (retrait.retirees > 0) {
      await graph(cible.tenant_id, "PATCH", `/users/${boite}/messages/${message}`, {
        body: { contentType: "html", content: retrait.html },
      });
    }
    if (categoriesARetirer > 0) {
      await graph(cible.tenant_id, "PATCH", `/users/${boite}/messages/${message}`, {
        categories: categoriesRestantes,
      });
    }

    await db.query("SELECT marquer_restauration_graph($1, $2)", [
      cible.company_id, cible.message_id,
    ]);

    console.log(
      `  ✓ ${court}  ${objet}\n` +
        `      bannière retirée (${retrait.methode}), ${categoriesARetirer} catégorie(s) retirée(s)`,
    );
    restaures += 1;
  } catch (erreur) {
    console.log(`  ✗ ${court}  ${objet}\n      ${erreur.message}`);
    echecs += 1;
  }
}

console.log(
  `\n  ${restaures} restauré(s), ${intacts} déjà propre(s), ${echecs} échec(s)\n` +
    (ESSAI ? "  (essai à blanc — relancer sans --essai pour agir)\n" : ""),
);

await db.end();
process.exit(echecs > 0 ? 1 : 0);
