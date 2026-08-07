/**
 * Client Supabase pour le navigateur (composants client).
 * Utilise les cookies via @supabase/ssr pour synchroniser la session.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
