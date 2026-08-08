/**
 * Lit et valide les variables Supabase exposées au client.
 * Évite le message brut de @supabase/ssr quand Netlify n'a pas d'env.
 */
export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) {
    throw new Error(
      "Configuration Supabase manquante. Sur Netlify : Project configuration → Environment variables → ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (mêmes valeurs que .env.local), puis redéployez.",
    );
  }

  return { url, anonKey };
}
