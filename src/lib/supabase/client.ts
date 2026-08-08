/**
 * Client Supabase pour le navigateur (composants client).
 * Utilise les cookies via @supabase/ssr pour synchroniser la session.
 */
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
