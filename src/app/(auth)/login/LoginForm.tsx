"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/state";

const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink shadow-xs outline-none transition placeholder:text-muted/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/20 sm:text-sm";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialActionState);
  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.message ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          {state.message}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email ?? ""}
          placeholder="tu@empresa.es"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className={inputClass}
        />
        {emailError ? (
          <p id="email-error" className="text-sm text-red-700">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
          className={inputClass}
        />
        {passwordError ? (
          <p id="password-error" className="text-sm text-red-700">
            {passwordError}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
