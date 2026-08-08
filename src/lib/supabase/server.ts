/**
 * Client Supabase pour le serveur (Server Components, Route Handlers, Server Actions).
 * Lit et écrit les cookies de session Next.js.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll peut échouer dans un Server Component en lecture seule —
          // le middleware se charge alors du refresh de session.
        }
      },
    },
  });
}
