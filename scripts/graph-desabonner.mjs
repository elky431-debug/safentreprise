/**
 * SUPPRIME chez Microsoft les abonnements Graph de Safentreprise.
 *
 *   npm run graph:desabonner -- --essai            montre, sans rien supprimer
 *   npm run graph:desabonner                       supprime tout
 *   npm run graph:desabonner -- --locataire GUID   un seul locataire
 *
 * POURQUOI CE SCRIPT EXISTE. Un abonnement Graph vit CHEZ MICROSOFT, pas dans
 * notre base. Supprimer la ligne de `graph_abonnements` ne le résilie pas : il
 * continue de poster sur le webhook jusqu'à son expiration — nous les créons
 * pour 9 600 minutes, soit près de sept jours. Le webhook les refuse
 * proprement (abonnement inconnu, aucune retentative), mais sept jours de
 * refus dans les logs masquent ce qu'on y cherche vraiment.
 *
 * ⚠ IL FAUT DONC LE LANCER AVANT DE RÉVOQUER LE CONSENTEMENT. Sans jeton
 *   Graph, plus aucun moyen de résilier : il ne resterait qu'à attendre.
 *
 * ⚠ CE QU'IL SUPPRIME, EXACTEMENT. `GET /subscriptions` en jeton
 *   d'application ne rend que les abonnements créés par CETTE application dans
 *   CE locataire. Il ne peut donc pas emporter l'abonnement d'un autre
 *   éditeur. C'est ce qui permet de tout supprimer sans filtre hasardeux sur
 *   l'URL de notification, qui change selon l'environnement.
 *
 * ⚠ UN 404 EST UN SUCCÈS. L'abonnement a expiré entre la lecture et la
 *   suppression, ou un autre passage l'a déjà retiré. Le but est qu'il n'y en
 *   ait plus, pas que ce script soit celui qui l'a retiré.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

for (const ligne of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, DATABASE_URL } = process.env;
const manquantes = Object.entries({ MS_CLIENT_ID, MS_CLIENT_SECRET, DATABASE_URL })
  .filter(([, v]) => !v).map(([k]) => k);
if (manquantes.length) {
  console.error(`\n❌ Variables absentes de .env.local :\n   ${manquantes.join("\n   ")}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const ESSAI = args.includes("--essai");
const UN_LOCATAIRE = args.includes("--locataire")
  ? args[args.indexOf("--locataire") + 1]
  : null;

// —————————————————————————— Graph ——————————————————————————

async function jeton(tenantId) {
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
  return d.access_token;
}

async function graph(acces, methode, chemin) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${acces}` },
  });
  if (r.status === 204 || r.status === 404) return { statut: r.status, corps: null };
  const texte = await r.text();
  const d = texte ? JSON.parse(texte) : null;
  if (!r.ok) {
    throw new Error(`${methode} ${chemin} → ${r.status} ${d?.error?.code ?? ""} ${d?.error?.message ?? ""}`);
  }
  return { statut: r.status, corps: d };
}

// —————————————————————————— Les locataires à traiter ——————————————————————————

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// ⚠ LA BASE N'EST PAS LA SOURCE DE VÉRITÉ ICI, ET C'EST TOUT L'INTÉRÊT. Un
//   locataire déjà supprimé de la base a pu laisser des abonnements vivants
//   chez Microsoft — c'est même le cas le plus probable quand on lance ce
//   script. D'où le repli sur MS_TENANT_ID, et l'option --locataire.
let locataires;
if (UN_LOCATAIRE) {
  locataires = [UN_LOCATAIRE];
} else {
  const { rows } = await db.query(
    "SELECT DISTINCT tenant_id FROM microsoft_tenants ORDER BY tenant_id",
  );
  locataires = rows.map((r) => r.tenant_id);
  if (locataires.length === 0 && MS_TENANT_ID) {
    console.log("  Aucun locataire en base — repli sur MS_TENANT_ID.\n");
    locataires = [MS_TENANT_ID];
  }
}

if (locataires.length === 0) {
  console.error(
    "\n❌ Aucun locataire à traiter.\n" +
      "   Précise-le : npm run graph:desabonner -- --locataire <GUID>\n",
  );
  await db.end();
  process.exit(1);
}

console.log(
  ESSAI
    ? "\n  ESSAI À BLANC — aucun abonnement ne sera supprimé\n"
    : "\n  RÉSILIATION DES ABONNEMENTS GRAPH\n",
);

let supprimes = 0;
let deja = 0;
let echecs = 0;

for (const tenantId of locataires) {
  console.log(`  Locataire ${tenantId}`);

  let acces;
  try {
    acces = await jeton(tenantId);
  } catch (erreur) {
    // ⚠ CE CAS EST ATTENDU SI LE CONSENTEMENT A DÉJÀ ÉTÉ RÉVOQUÉ. On le dit
    //   en clair plutôt que de rendre une erreur d'authentification brute :
    //   c'est l'erreur que fera le plus souvent celui qui suit la procédure
    //   dans le désordre.
    console.log(
      `    ✗ ${erreur.message}\n` +
        `      Si le consentement a déjà été révoqué dans Entra ID, il n'y a\n` +
        `      plus rien à faire ici : les abonnements s'éteindront d'eux-mêmes\n` +
        `      sous sept jours.\n`,
    );
    echecs += 1;
    continue;
  }

  let liste;
  try {
    liste = (await graph(acces, "GET", "/subscriptions")).corps?.value ?? [];
  } catch (erreur) {
    console.log(`    ✗ lecture impossible : ${erreur.message}\n`);
    echecs += 1;
    continue;
  }

  if (liste.length === 0) {
    console.log("    Aucun abonnement actif chez Microsoft.\n");
    continue;
  }

  for (const abonnement of liste) {
    const court = abonnement.id.slice(0, 8);
    const expire = abonnement.expirationDateTime
      ? new Date(abonnement.expirationDateTime).toLocaleString("fr-FR")
      : "?";
    const ligne = `${court}…  ${abonnement.resource ?? "?"}  expire le ${expire}`;

    if (ESSAI) {
      console.log(`    · ${ligne}`);
      continue;
    }

    try {
      const { statut } = await graph(acces, "DELETE", `/subscriptions/${abonnement.id}`);
      if (statut === 404) {
        console.log(`    ✓ ${ligne}\n        déjà absent chez Microsoft`);
        deja += 1;
      } else {
        console.log(`    ✓ ${ligne}\n        résilié`);
        supprimes += 1;
      }

      // ⚠ LA LIGNE EN BASE PASSE À « supprime », SINON LA MAINTENANCE LE
      //   RECRÉE. `abonnements_a_renouveler()` reprend les statuts 'actif',
      //   'perdu' et 'erreur' — un abonnement résilié chez Microsoft y
      //   apparaîtrait comme perdu, et le cron le recréerait au prochain
      //   passage. Seul 'supprime' sort de sa vue. Sans effet si la ligne a
      //   déjà disparu de la base, ce qui est le cas courant.
      await db.query(
        `UPDATE graph_abonnements
            SET statut = 'supprime', updated_at = now()
          WHERE subscription_id = $1`,
        [abonnement.id],
      );
    } catch (erreur) {
      console.log(`    ✗ ${ligne}\n        ${erreur.message}`);
      echecs += 1;
    }
  }
  console.log("");
}

console.log(
  ESSAI
    ? "  (essai à blanc — relancer sans --essai pour résilier)\n"
    : `  ${supprimes} résilié(s), ${deja} déjà absent(s), ${echecs} échec(s)\n`,
);

await db.end();
process.exit(echecs > 0 ? 1 : 0);
