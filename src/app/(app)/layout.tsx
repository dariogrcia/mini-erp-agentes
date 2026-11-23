import { Suspense, type ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { getCurrentUser } from "@/lib/auth";

/**
 * Private area. The shell (navigation) is static; the session check (SEG-4,
 * second line after proxy.ts) runs inside <Suspense> (D10) and gates the page
 * content, so nothing private renders without a valid user.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppNav
        user={
          <Suspense fallback={null}>
            <UserEmail />
          </Suspense>
        }
      />
      <main className="flex-1 pb-24 md:pb-0 md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<ContentSkeleton />}>
            <RequireUser>{children}</RequireUser>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function RequireUser({ children }: { children: ReactNode }) {
  await getCurrentUser();
  return children;
}

async function UserEmail() {
  const user = await getCurrentUser();
  return user.email;
}

function ContentSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-line" />
      <div className="h-32 animate-pulse rounded-2xl bg-surface" />
      <div className="h-32 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}
