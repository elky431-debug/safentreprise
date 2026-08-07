/**
 * Rejoue l'appel de comptage exactement comme le fait le tableau de bord,
 * via supabase-js et avec une vraie session utilisateur.
 * Usage : node scripts/test-comptage-js.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((ligne) => ligne.includes("="))
    .map((ligne) => [
      ligne.slice(0, ligne.indexOf("=")).trim(),
      ligne.slice(ligne.indexOf("=") + 1).trim(),
    ]),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { error: erreurConnexion } = await supabase.auth.signInWithPassword({
  email: "demo@safentreprise.com",
  password: "DemoSaf2026!",
});

if (erreurConnexion) {
  console.error("Connexion :", erreurConnexion.message);
  process.exit(1);
}

const {
  data: { user },
} = await supabase.auth.getUser();

const { data: company } = await supabase
  .from("companies")
  .select("*")
  .eq("user_id", user.id)
  .maybeSingle();

console.log(`Société : ${company?.nom} (${company?.id})`);

// Forme utilisée par le tableau de bord
const tete = await supabase
  .from("employees")
  .select("*", { count: "exact", head: true })
  .eq("company_id", company.id);

console.log(
  `head:true      count=${tete.count} error=${tete.error?.message ?? "aucune"}`,
);

// Forme alternative : comptage sur une requête GET
const complet = await supabase
  .from("employees")
  .select("id", { count: "exact" })
  .eq("company_id", company.id);

console.log(
  `GET + count    count=${complet.count} lignes=${complet.data?.length} error=${complet.error?.message ?? "aucune"}`,
);

const campagnes = await supabase
  .from("campaigns")
  .select("*", { count: "exact", head: true })
  .eq("company_id", company.id);

console.log(
  `campagnes head count=${campagnes.count} error=${campagnes.error?.message ?? "aucune"}`,
);
