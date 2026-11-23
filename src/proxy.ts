import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/login";
const HOME_PATH = "/dashboard";

/**
 * Refreshes the Supabase session on every matched request and protects routes
 * (SEG-4). This is an optimistic check: the private layout and every Server
 * Action / Route Handler verify the session again close to the data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(): getUser() is what
  // validates the token and triggers the refresh that writes the new cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === LOGIN_PATH;

  if (!user && !isLogin) {
    // API clients get a 401 instead of an HTML redirect.
    if (pathname.startsWith("/api/")) {
      return withSessionCookies(
        NextResponse.json({ error: "No autenticado" }, { status: 401 }),
        response,
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/** Keeps refreshed/cleared auth cookies when returning a different response. */
function withSessionCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(key);
    if (value) target.headers.set(key, value);
  }
  return target;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
