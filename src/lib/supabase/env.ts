/**
 * Lit les variables Supabase exposées au client / serveur.
 * Retourne null si Netlify (ou .env.local) n'est pas configuré —
 * les pages publiques ne doivent pas crasher pour autant.
 */
export function getSupabasePublicEnv(): {
  url: string;
  anonKey: string;
} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Même chose, mais lève une erreur explicite (login, API, zones protégées). */
export function requireSupabasePublicEnv(): { url: string; anonKey: string } {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Configuration Supabase manquante. Sur Netlify : Project configuration → Environment variables → ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY, puis Clear cache and deploy.",
    );
  }
  return env;
}
