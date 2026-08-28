/**
 * EXPÉRIENCE : Graph accepte-t-il de passer un corps « text » en « html » ?
 *
 *   npm run graph:essai-conversion -- --message <ID_DU_MESSAGE>
 *
 * La documentation ne répond pas. Elle affirme même que `body` n'est
 * modifiable que sur un brouillon, ce qu'on sait faux depuis le spike : un
 * PATCH sur un message reçu fonctionne. Elle n'est donc pas une autorité ici,
 * et seule une expérience tranche.
 *
 * CE QUE FAIT CE SCRIPT, DANS L'ORDRE :
 *
 *   1. lit le message et écrit une copie du corps DANS UN FICHIER LOCAL ;
 *   2. n'agit QUE si le corps est réellement en texte brut ;
 *   3. PATCH avec contentType « html » et un corps HTML reconnaissable ;
 *   4. relit, et rapporte ce que Graph a réellement enregistré ;
 *   5. RÉTABLIT le corps d'origine, dans son contentType d'origine ;
 *   6. relit une dernière fois pour prouver que le message est comme avant.
 *
 * La remise en état a lieu même si l'expérience échoue. Si elle échoue elle
 * aussi, le fichier local reste : le corps y est, et le message d'erreur dit
 * comment le remettre à la main.
 *
 * À lancer sur un message d'essai que vous vous êtes envoyé — pas sur un vrai
 * message de client.
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

for (const ligne of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, DATABASE_URL } = process.env;
const manquantes = Object.entries({ MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, DATABASE_URL })
  .filter(([, v]) => !v).map(([k]) => k);
if (manquantes.length) {
  console.error(`\n❌ Variables absentes de .env.local :\n   ${manquantes.join("\n   ")}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const MESSAGE_ID = args.includes("--message") ? args[args.indexOf("--message") + 1] : null;
if (!MESSAGE_ID) {
  console.error(
    "\n❌ Indiquer le message : npm run graph:essai-conversion -- --message <ID>\n\n" +
      "   Pour trouver un identifiant d'essai :\n" +
      "     SELECT message_id, objet FROM graph_analyses ORDER BY analyse_at DESC LIMIT 5;\n",
  );
  process.exit(1);
}

// —————————————————————————— Graph ——————————————————————————

async function jeton() {
  const r = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
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
  return d.access_token;
}

let acces;
async function graph(methode, chemin, corps) {
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

const { rows } = await db.query(
  `SELECT b.graph_user_id, b.upn, a.objet
     FROM graph_analyses a
     JOIN boites_surveillees b ON b.id = a.boite_id
    WHERE a.message_id = $1 LIMIT 1`,
  [MESSAGE_ID],
);
if (rows.length === 0) {
  console.error(`\n❌ Message ${MESSAGE_ID.slice(0, 30)}… introuvable dans graph_analyses.\n`);
  await db.end();
  process.exit(1);
}
const { graph_user_id: boiteId, upn, objet } = rows[0];
await db.end();

acces = await jeton();
const boite = encodeURIComponent(boiteId);
const message = encodeURIComponent(MESSAGE_ID);
const chemin = `/users/${boite}/messages/${message}`;

console.log(`\n  EXPÉRIENCE : conversion text → html`);
console.log(`  Message : « ${objet ?? "(sans objet)"} » dans ${upn}\n`);

const avant = await graph("GET", `${chemin}?$select=id,body`);
const typeAvant = avant?.body?.contentType ?? "(absent)";
const corpsAvant = avant?.body?.content ?? "";

console.log(`  1. État initial`);
console.log(`     contentType : ${typeAvant}`);
console.log(`     longueur    : ${corpsAvant.length} caractères`);
console.log(`     début       : ${JSON.stringify(corpsAvant.slice(0, 100))}`);

const fichier = `/tmp/safentreprise-corps-${Date.now()}.txt`;
writeFileSync(fichier, JSON.stringify({ contentType: typeAvant, content: corpsAvant }, null, 2));
console.log(`\n  2. Copie de sécurité écrite dans ${fichier}`);

if (typeAvant !== "text") {
  console.log(
    `\n  ⚠ Ce message n'est pas en texte brut (contentType « ${typeAvant} »).\n` +
      `     L'expérience ne dit rien dans ce cas : il faut un message que Graph\n` +
      `     annonce réellement en « text ». Aucune modification effectuée.\n`,
  );
  process.exit(0);
}

const TEMOIN = "SAFENTREPRISE-ESSAI-CONVERSION";
const corpsHtml =
  `<div data-safentreprise="essai"><p><b>${TEMOIN}</b></p></div>` +
  corpsAvant.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .split("\n").join("<br>");

let verdict = "inconnu";
try {
  console.log(`\n  3. PATCH avec contentType « html »…`);
  await graph("PATCH", chemin, { body: { contentType: "html", content: corpsHtml } });

  const apres = await graph("GET", `${chemin}?$select=id,body`);
  const typeApres = apres?.body?.contentType ?? "(absent)";
  const corpsApres = apres?.body?.content ?? "";

  console.log(`\n  4. Ce que Graph a réellement enregistré`);
  console.log(`     contentType : ${typeApres}`);
  console.log(`     longueur    : ${corpsApres.length} caractères`);
  console.log(`     début       : ${JSON.stringify(corpsApres.slice(0, 160))}`);

  const balisePresente = corpsApres.includes("data-safentreprise");
  const baliseEchappee = corpsApres.includes("&lt;div") || corpsApres.includes("&lt;b&gt;");

  if (balisePresente && !baliseEchappee) {
    verdict = "ACCEPTÉE";
    console.log(
      `\n  ✅ CONVERSION ACCEPTÉE. La balise est présente, non échappée :\n` +
        `     Graph a bien enregistré le corps en HTML.`,
    );
  } else if (baliseEchappee) {
    verdict = "REFUSÉE (balises échappées)";
    console.log(
      `\n  ❌ CONVERSION REFUSÉE. Les balises ont été échappées : Exchange a\n` +
        `     traité notre HTML comme du texte. Une bannière HTML s'y afficherait\n` +
        `     sous forme de balises visibles.`,
    );
  } else {
    verdict = "INDÉTERMINÉE";
    console.log(
      `\n  ⚠ RÉSULTAT INDÉTERMINÉ : le témoin n'a pas été retrouvé.\n` +
        `     Regarder le début du corps ci-dessus pour comprendre.`,
    );
  }
} catch (erreur) {
  verdict = `REFUSÉE (${erreur.message.slice(0, 120)})`;
  console.log(`\n  ❌ Le PATCH a échoué : ${erreur.message}`);
} finally {
  // ─────────────────────────────────────────────────────────────────────
  // REMISE EN ÉTAT, quoi qu'il arrive.
  // ─────────────────────────────────────────────────────────────────────
  try {
    console.log(`\n  5. Remise en état du corps d'origine…`);
    await graph("PATCH", chemin, {
      body: { contentType: typeAvant, content: corpsAvant },
    });

    const final = await graph("GET", `${chemin}?$select=id,body`);
    const identique = (final?.body?.content ?? "") === corpsAvant;
    const typeIdentique = (final?.body?.contentType ?? "") === typeAvant;

    console.log(
      identique && typeIdentique
        ? `     ✓ Message identique à l'état initial.`
        : `     ⚠ Le message DIFFÈRE de l'état initial.\n` +
          `       contentType : ${final?.body?.contentType} (attendu ${typeAvant})\n` +
          `       longueur    : ${final?.body?.content?.length} (attendu ${corpsAvant.length})\n` +
          `       La copie est dans ${fichier}.`,
    );
  } catch (erreur) {
    console.error(
      `\n  ❌ REMISE EN ÉTAT IMPOSSIBLE : ${erreur.message}\n` +
        `     Le corps d'origine est dans ${fichier}.\n` +
        `     Le remettre à la main avec un PATCH sur ${chemin}.\n`,
    );
  }
}

console.log(`\n  VERDICT : conversion text → html ${verdict}\n`);
