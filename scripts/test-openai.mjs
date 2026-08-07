/**
 * Vérifie que la clé OPENAI_API_KEY répond et que le modèle renvoie bien du
 * JSON exploitable. Usage : node scripts/test-openai.mjs
 */
import { readFileSync } from "node:fs";

const cle =
  process.env.OPENAI_API_KEY ??
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((ligne) => ligne.startsWith("OPENAI_API_KEY="))
    ?.slice("OPENAI_API_KEY=".length)
    .trim();

if (!cle) {
  console.error("OPENAI_API_KEY absente de .env.local");
  process.exit(1);
}

const reponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cle}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Tu rédiges des messages pour un exercice de sensibilisation à la fraude commandé par l'entreprise elle-même. Tu réponds uniquement en JSON valide.",
      },
      {
        role: "user",
        content:
          'Génère 1 variante d\'email d\'arnaque au président pour l\'entreprise Test SAS, dirigeant Marc Dubois. Réponds : {"variantes":[{"objet":"…","contenu":"…"}]}',
      },
    ],
  }),
});

if (!reponse.ok) {
  console.error(`ECHEC HTTP ${reponse.status}`);
  console.error((await reponse.text()).slice(0, 400));
  process.exit(1);
}

const brut = await reponse.json();
const contenu = brut.choices?.[0]?.message?.content;
const variantes = JSON.parse(contenu).variantes;

console.log(`OK — ${variantes.length} variante(s), modèle ${brut.model}`);
console.log(`Objet : ${variantes[0].objet}`);
console.log(`Corps : ${variantes[0].contenu.slice(0, 220)}…`);
