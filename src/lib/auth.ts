import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Data Access Layer (D10). Reads the session at request time, so callers must
 * sit inside a <Suspense> boundary. Uses auth.getUser(), which validates the
 * token against Supabase Auth (getSession() only trusts the cookie).
 * Redirects to /login when there is no valid session.
 * Not wrapped in "use cache": the result depends on the user's cookie.
 * React cache() only dedupes calls within a single request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { id: user.id, email: user.email ?? null };
});
