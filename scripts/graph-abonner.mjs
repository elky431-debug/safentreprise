/**
 * Crée un abonnement Microsoft Graph sur une boîte, et enregistre tout ce
 * qu'il faut en base pour que le webhook accepte les notifications.
 *
 *   npm run graph:abonner
 *
 * Le script est idempotent : relancé, il réutilise le locataire, la boîte et
 * l'abonnement existants plutôt que d'en créer des doublons.
 *
 * Variables lues dans .env.local :
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   application Azure
 *   MS_MAILBOX                                     boîte à surveiller
 *   GRAPH_NOTIFICATION_URL                         URL publique du webhook
 *   DATABASE_URL                                   base Supabase
 *
 * L'URL de notification doit être joignable par Microsoft AVANT l'appel :
 * Graph l'appelle immédiatement pour la poignée de main de validation, et
 * refuse de créer l'abonnement si elle ne répond pas correctement.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

/* --------------------------------------------------------------------------
   Configuration
   -------------------------------------------------------------------------- */

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

const config = (cle) => process.env[cle] ?? lireEnvLocal(cle);

const REQUIS = [
  "MS_TENANT_ID",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "MS_MAILBOX",
  "GRAPH_NOTIFICATION_URL",
  "DATABASE_URL",
];

const manquants = REQUIS.filter((cle) => !config(cle));
if (manquants.length) {
  console.error(
    `\n❌ Variables manquantes dans .env.local :\n   ${manquants.join("\n   ")}\n`,
  );
  process.exit(1);
}

const NOTIFICATION_URL = config("GRAPH_NOTIFICATION_URL");
if (!NOTIFICATION_URL.startsWith("https://")) {
  console.error(
    "\n❌ GRAPH_NOTIFICATION_URL doit être en HTTPS et joignable publiquement.",
  );
  console.error("   Microsoft appelle cette URL avant de créer l'abonnement.\n");
  process.exit(1);
}

/* --------------------------------------------------------------------------
   Graph
   -------------------------------------------------------------------------- */

async function obtenirJeton() {
  const reponse = await fetch(
    `https://login.microsoftonline.com/${config("MS_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config("MS_CLIENT_ID"),
        client_secret: config("MS_CLIENT_SECRET"),
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  const donnees = await reponse.json();
  if (!reponse.ok) {
    console.error(`\n❌ Authentification refusée (HTTP ${reponse.status})`);
    console.error(`   ${donnees.error}: ${donnees.error_description}`);
    process.exit(1);
  }
  return donnees.access_token;
}

async function appelGraph(jeton, methode, chemin, corps) {
  const url = `https://graph.microsoft.com/v1.0${chemin}`;
  console.log(`[graph] ${methode} ${url}`);

  const reponse = await fetch(url, {
    method: methode,
    headers: {
      Authorization: `Bearer ${jeton}`,
      ...(corps ? { "Content-Type": "application/json" } : {}),
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });

  const texte = await reponse.text();
  const donnees = texte ? JSON.parse(texte) : null;

  if (!reponse.ok) {
    const erreur = donnees?.error ?? {};
    console.error(`\n❌ HTTP ${reponse.status} — ${erreur.code ?? "?"}`);
    console.error(`   ${erreur.message ?? texte.slice(0, 300)}`);

    if (reponse.status === 400 && /validat/i.test(erreur.message ?? "")) {
      console.error(
        "\n   Microsoft n'a pas obtenu de réponse correcte à la poignée de main.",
      );
      console.error(`   Vérifie que ${NOTIFICATION_URL} est bien déployée :`);
      console.error(`     curl "${NOTIFICATION_URL}?validationToken=essai"`);
      console.error("   doit renvoyer exactement « essai », en text/plain.\n");
    }
    process.exit(1);
  }

  console.log(`[graph] ${reponse.status} ✓`);
  return donnees;
}

/* --------------------------------------------------------------------------
   Déroulé
   -------------------------------------------------------------------------- */

const jeton = await obtenirJeton();
console.log("[auth] jeton obtenu ✓");

// 1. Qui est la boîte, du point de vue de Graph ?
const boite = await appelGraph(
  jeton,
  "GET",
  `/users/${encodeURIComponent(config("MS_MAILBOX"))}?$select=id,userPrincipalName`,
);

const db = new Client({ connectionString: config("DATABASE_URL") });
await db.connect();

try {
  // 2. La société. Une seule en base pour l'instant : on la prend, sinon on
  //    exige un identifiant explicite plutôt que de deviner.
  const societes = await db.query("SELECT id, nom FROM companies ORDER BY created_at");
  const cible = process.argv[2]
    ? societes.rows.find((s) => s.id === process.argv[2])
    : societes.rows[0];

  if (!cible) {
    console.error(
      `\n❌ Société introuvable. Sociétés en base :\n` +
        societes.rows.map((s) => `   ${s.id}  ${s.nom}`).join("\n") +
        `\n\n   Précise-la : npm run graph:abonner -- <company_id>\n`,
    );
    process.exit(1);
  }
  console.log(`\n[base] société : ${cible.nom} (${cible.id})`);

  // 3. Locataire
  const tenant = await db.query(
    `INSERT INTO microsoft_tenants (company_id, tenant_id, consenti_at)
     VALUES ($1, $2, now())
     ON CONFLICT (tenant_id) DO UPDATE SET statut = 'actif'
     RETURNING id`,
    [cible.id, config("MS_TENANT_ID")],
  );
  const tenantUid = tenant.rows[0].id;

  // 4. Boîte surveillée
  const surveillee = await db.query(
    `INSERT INTO boites_surveillees (company_id, tenant_uid, graph_user_id, upn)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_uid, graph_user_id) DO UPDATE SET actif = true, upn = EXCLUDED.upn
     RETURNING id`,
    [cible.id, tenantUid, boite.id, boite.userPrincipalName],
  );
  const boiteId = surveillee.rows[0].id;
  console.log(`[base] boîte    : ${boite.userPrincipalName}`);

  // 5. Abonnement déjà actif ? On ne le double pas.
  const existant = await db.query(
    `SELECT subscription_id, expire_at FROM graph_abonnements
      WHERE boite_id = $1 AND statut = 'actif' AND expire_at > now()`,
    [boiteId],
  );

  if (existant.rows.length > 0) {
    const a = existant.rows[0];
    console.log(
      `\n✓ Un abonnement actif existe déjà : ${a.subscription_id}` +
        `\n  Expire le ${new Date(a.expire_at).toLocaleString("fr-FR")}\n`,
    );
    process.exit(0);
  }

  // 6. Création de l'abonnement.
  //    changeType « created » UNIQUEMENT : avec « updated », notre propre
  //    injection de bannière déclencherait une notification, qu'on
  //    réanalyserait, qui provoquerait une nouvelle injection — boucle.
  const clientState = randomBytes(32).toString("base64url");

  // 24 heures. Le plafond réel des ressources mail est annoncé entre 3 et 7
  // jours selon les pages de documentation ; 24 h est sûr dans les deux cas,
  // et le renouvellement passera bien avant.
  const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const resource = `/users/${boite.id}/mailFolders('inbox')/messages`;

  const abonnement = await appelGraph(jeton, "POST", "/subscriptions", {
    changeType: "created",
    notificationUrl: NOTIFICATION_URL,
    resource,
    clientState,
    expirationDateTime: expiration,
  });

  await db.query(
    `INSERT INTO graph_abonnements
       (company_id, boite_id, subscription_id, resource, client_state, expire_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      cible.id,
      boiteId,
      abonnement.id,
      resource,
      clientState,
      abonnement.expirationDateTime,
    ],
  );

  console.log(`\n✓ Abonnement créé`);
  console.log(`  Identifiant : ${abonnement.id}`);
  console.log(`  Ressource   : ${resource}`);
  console.log(
    `  Expire le   : ${new Date(abonnement.expirationDateTime).toLocaleString("fr-FR")}`,
  );
  console.log(`  Notifie     : ${NOTIFICATION_URL}`);
  console.log(
    `\n  Envoie-toi un mail sur ${boite.userPrincipalName}, puis :\n` +
      `    SELECT message_id, origine, statut, recu_at\n` +
      `      FROM graph_file_attente ORDER BY recu_at DESC LIMIT 5;\n`,
  );
} finally {
  await db.end();
}
