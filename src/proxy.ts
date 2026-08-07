/**
 * Proxy Next.js : rafraîchit la session Supabase et protège les routes
 * authentifiées avant le rendu.
 */
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Exclut les assets statiques et les images.
     * Inclut les pages d'authentification et les zones protégées.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
