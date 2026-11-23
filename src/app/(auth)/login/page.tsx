import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white shadow-sm"
          >
            G
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Gestia</h1>
          <p className="mt-1 text-sm text-muted">Clientes, inventario y facturas con IVA</p>
        </div>

        <section
          aria-labelledby="login-title"
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8"
        >
          <h2 id="login-title" className="mb-6 text-lg font-semibold text-ink">
            Inicia sesión
          </h2>
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginFormWithNext searchParams={searchParams} />
          </Suspense>
        </section>

        <aside
          aria-labelledby="demo-title"
          className="mt-4 rounded-xl border border-dashed border-brand-500/50 bg-brand-50 px-4 py-3 text-sm text-brand-900"
        >
          <p id="demo-title" className="font-semibold">
            Cuenta de demostración
          </p>
          <p className="mt-1 text-brand-900/80">Se publicarán en el README.</p>
        </aside>
      </div>
    </main>
  );
}

async function LoginFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-20 animate-pulse rounded bg-line" />
          <div className="h-10 animate-pulse rounded-lg bg-canvas" />
        </div>
      ))}
      <div className="h-10 animate-pulse rounded-lg bg-brand-100" />
    </div>
  );
}
