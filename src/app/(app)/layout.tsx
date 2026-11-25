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
      {/* AppNav reads usePathname(): on routes with a dynamic param (/facturas/[id]) the
          pathname is unknown at prerender, so it must sit inside Suspense (D10). */}
      <Suspense fallback={<NavFallback />}>
        <AppNav
          user={
            <Suspense fallback={null}>
              <UserEmail />
            </Suspense>
          }
        />
      </Suspense>
      <main className="flex-1 pb-24 md:pb-0 md:pl-60 print:pb-0 print:pl-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
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

/** Reserves the mobile top bar height so the content does not jump when the nav streams in. */
function NavFallback() {
  return <div aria-hidden="true" className="h-14 border-b border-line bg-surface md:hidden print:hidden" />;
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
