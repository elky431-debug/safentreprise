/**
 * Rafraîchit l'instantané de l'annuaire d'un locataire Microsoft 365.
 *
 *   npm run graph:annuaire
 *
 * Lit /users, en déduit les domaines de l'entreprise, et remplace
 * l'instantané. Les domaines déclarés À LA MAIN par le client ne sont jamais
 * touchés : le rafraîchissement ne réécrit que les lignes de source
 * « annuaire ».
 *
 * À terme, une tâche planifiée quotidienne. En attendant, à la main.
 *
 * Ce que le moteur en fait :
 *   • les domaines internes servent de référence au typosquattage ;
 *   • l'annuaire sert à repérer l'usurpation d'une identité de l'entreprise.
 *
 * Sans instantané, ces deux détections ne fonctionnent pas — le reste du
 * moteur, si.
 */
import { readFileSync } from "node:fs";

// —————————————————————————— Environnement ——————————————————————————

for (const ligne of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_TENANT_ID,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEY,
} = process.env;

const manquantes = Object.entries({
  MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID,
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
}).filter(([, v]) => !v).map(([k]) => k);

if (manquantes.length) {
  console.error(`Variables absentes de .env.local : ${manquantes.join(", ")}`);
  process.exit(1);
}

// —————————————————————————— Graph ——————————————————————————

async function jeton() {
  const r = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  const d = await r.json();
  if (!r.ok || !d.access_token) {
    throw new Error(`Authentification refusée : ${d.error_description ?? d.error ?? r.status}`);
  }
  return d.access_token;
}

async function lireAnnuaire(acces) {
  const personnes = [];
  let chemin = "/users?$select=id,displayName,mail,userPrincipalName&$top=999";
  let pages = 0;

  while (chemin) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
      headers: { Authorization: `Bearer ${acces}` },
    });
    const d = await r.json();
    if (!r.ok) {
      throw new Error(
        `GET ${chemin} → ${r.status} ${d?.error?.code ?? ""} ${d?.error?.message ?? ""}`,
      );
    }

    for (const u of d.value ?? []) {
      const nom = (u.displayName ?? "").trim();
      if (!u.id || !nom) continue;
      personnes.push({
        graph_user_id: u.id,
        nom,
        email: (u.mail ?? u.userPrincipalName ?? "").toLowerCase() || null,
      });
    }

    pages += 1;
    const suivant = d["@odata.nextLink"];
    chemin = suivant ? suivant.replace("https://graph.microsoft.com/v1.0", "") : null;
  }

  return { personnes, pages };
}

// —————————————————————————— Base ——————————————————————————

async function rpc(nom, parametres) {
  const r = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parametres),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${nom} → HTTP ${r.status} — ${texte.slice(0, 400)}`);
  return texte ? JSON.parse(texte) : null;
}

async function tenantUid() {
  const r = await fetch(
    `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/microsoft_tenants` +
      `?tenant_id=eq.${encodeURIComponent(MS_TENANT_ID)}&select=id,company_id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    },
  );
  const lignes = await r.json();
  if (!r.ok || !Array.isArray(lignes) || lignes.length === 0) {
    throw new Error(
      `Locataire ${MS_TENANT_ID} introuvable. Lancer d'abord : npm run graph:abonner`,
    );
  }
  return lignes[0];
}

// —————————————————————————— Exécution ——————————————————————————

console.log("Lecture de l'annuaire Microsoft 365…\n");

const locataire = await tenantUid();
const acces = await jeton();
const { personnes, pages } = await lireAnnuaire(acces);

// Les domaines techniques du locataire n'identifient pas l'entreprise :
// tout locataire en possède un, le comparer à quoi que ce soit n'a pas de sens.
const comptes = new Map();
for (const p of personnes) {
  const d = p.email?.split("@")[1];
  if (!d || d.endsWith(".onmicrosoft.com")) continue;
  comptes.set(d, (comptes.get(d) ?? 0) + 1);
}
const domaines = [...comptes.keys()].sort();

console.log(`  ${personnes.length} personne(s) sur ${pages} page(s)`);
console.log(`  ${domaines.length} domaine(s) déduit(s) :`);
for (const d of domaines) console.log(`    ${d.padEnd(40)} ${comptes.get(d)} adresse(s)`);

if (personnes.length === 0) {
  console.error(
    "\nAucune personne lue. L'instantané n'est PAS remplacé — une charge vide\n" +
      "est un échec d'appel, pas une entreprise sans salarié.\n" +
      "Vérifier la permission User.Read.All en autorisation d'application.",
  );
  process.exit(1);
}

const [resultat] = await rpc("rafraichir_annuaire_graph", {
  p_tenant_uid: locataire.id,
  p_personnes: personnes,
  p_domaines: domaines,
});

console.log(
  `\n  Instantané à jour : ${resultat.personnes} personne(s), ` +
    `${resultat.domaines} domaine(s).`,
);
console.log(
  "\n  Les domaines ajoutés à la main par le client ne sont pas touchés.\n" +
    "  Pour en déclarer un (routeur d'emailing, filiale) :\n\n" +
    "    INSERT INTO company_domaines (company_id, domaine, interne, source, note)\n" +
    `    VALUES ('${locataire.company_id}', 'exemple.com', false, 'manuel', 'Routeur');\n`,
);
