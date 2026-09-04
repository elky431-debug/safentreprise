/**
 * Vérifications du raccordement, partie sans entrée/sortie.
 *
 *   node --experimental-strip-types --test src/lib/microsoft/consentement.test.ts
 *
 * Ce qui compte ici : une URI de redirection qui ne correspond pas à Azure
 * doit être refusée AVANT de partir chez Microsoft, et l'URL de consentement
 * doit porter exactement les quatre paramètres attendus.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const ENV = { ...process.env };

async function charger() {
  // Le module lit process.env à l'import : on le recharge à chaque cas.
  const chemin = `./consentement.ts?${Math.random()}`;
  return (await import(chemin)) as typeof import("./consentement.ts");
}

function poser(valeurs: Record<string, string | undefined>) {
  process.env = { ...ENV, ...valeurs };
}

test("refuse une configuration sans MS_CLIENT_ID", async () => {
  poser({ MS_CLIENT_ID: undefined, MS_REDIRECT_URI: undefined });
  const { configurationConsentement } = await charger();
  const r = configurationConsentement();
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.erreur : "", /MS_CLIENT_ID/);
});

test("refuse une MS_REDIRECT_URI absente, et dit quoi poser", async () => {
  poser({ MS_CLIENT_ID: "id", MS_REDIRECT_URI: undefined });
  const { configurationConsentement } = await charger();
  const r = configurationConsentement();
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.erreur : "", /api\/microsoft\/consentement/);
});

test("refuse http, refuse une barre oblique finale, refuse un autre chemin", async () => {
  const mauvaises = [
    "http://exemple.fr/api/microsoft/consentement",
    "https://exemple.fr/api/microsoft/consentement/",
    "https://exemple.fr/api/microsoft/Consentement",
    "https://exemple.fr/callback",
    "pas-une-url",
  ];
  for (const valeur of mauvaises) {
    poser({ MS_CLIENT_ID: "id", MS_REDIRECT_URI: valeur });
    const { configurationConsentement } = await charger();
    assert.equal(
      configurationConsentement().ok,
      false,
      `aurait dû refuser : ${valeur}`,
    );
  }
});

test("accepte l'URI exacte", async () => {
  poser({
    MS_CLIENT_ID: "id",
    MS_REDIRECT_URI: "https://exemple.fr/api/microsoft/consentement",
  });
  const { configurationConsentement } = await charger();
  const r = configurationConsentement();
  assert.equal(r.ok, true);
});

test("l'URL de consentement porte les quatre paramètres, non altérés", async () => {
  poser({
    MS_CLIENT_ID: "abc-123",
    MS_REDIRECT_URI: "https://exemple.fr/api/microsoft/consentement",
    MS_LOGIN_BASE_URL: undefined,
  });
  const { configurationConsentement, urlConsentement } = await charger();
  const config = configurationConsentement();
  assert.equal(config.ok, true);
  if (!config.ok) return;

  // Un jeton d'état contient - et _ : il ne doit pas être déformé.
  const etat = "aB3-_xYz";
  const url = new URL(urlConsentement(config.config, etat));

  assert.equal(url.origin, "https://login.microsoftonline.com");
  assert.equal(url.pathname, "/organizations/v2.0/adminconsent");
  assert.equal(url.searchParams.get("client_id"), "abc-123");
  assert.equal(url.searchParams.get("scope"), "https://graph.microsoft.com/.default");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://exemple.fr/api/microsoft/consentement",
  );
  assert.equal(url.searchParams.get("state"), etat);
});

test("l'adresse appelante privilégie l'en-tête Netlify, puis la première transmise", async () => {
  poser({});
  const { adresseAppelante } = await charger();

  const avecNetlify = new Request("https://x.fr", {
    headers: {
      "x-nf-client-connection-ip": "203.0.113.7",
      "x-forwarded-for": "10.0.0.1, 70.41.3.18",
    },
  });
  assert.equal(adresseAppelante(avecNetlify), "203.0.113.7");

  const avecChaine = new Request("https://x.fr", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assert.equal(adresseAppelante(avecChaine), "203.0.113.9");

  assert.equal(adresseAppelante(new Request("https://x.fr")), null);
});

process.env = ENV;
