import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Read-only use: every write goes
 * through a Server Action (COMO-PROGRAMAR §1.3).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
