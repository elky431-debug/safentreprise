/**
 * Helper de middleware : rafraîchit la session Supabase
 * et protège les routes authentifiées.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/employees") ||
    path.startsWith("/campaigns") ||
    path.startsWith("/settings") ||
    path.startsWith("/certificates") ||
    path.startsWith("/help");

  const isAuthPage = path === "/login" || path === "/signup";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  // Sans variables Netlify : ne pas planter toute la requête
  if (!supabaseUrl || !supabaseAnon) {
    if (isProtected || isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Important : getUser() valide le JWT auprès de Supabase (ne pas utiliser getSession ici)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Non connecté → redirection vers login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Déjà connecté → redirection vers dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
