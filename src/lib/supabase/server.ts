import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request: it is bound to the request cookies.
 * Only the public URL and anon key are used; security comes from RLS.
 */
export async function createClient() {
  // supabase-js reads the clock (token expiry). With Cache Components that is only
  // allowed at request time, so opt out of any prerender stage explicitly (D10).
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies; proxy.ts keeps the session fresh.
          }
        },
      },
    },
  );
}
