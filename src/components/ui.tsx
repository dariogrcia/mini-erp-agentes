import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Small presentational building blocks shared by the entity pages
 * (clientes, productos, facturas). No hooks: usable from Server and Client
 * Components alike.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-900",
  secondary: "border border-line bg-surface text-ink shadow-xs hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  danger: "bg-red-700 text-white shadow-sm hover:bg-red-800",
  dangerGhost: "text-red-700 hover:bg-red-50 hover:text-red-800",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

/** Class names for a button or a link styled as a button. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink shadow-xs outline-none transition placeholder:text-muted/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/20 sm:text-sm";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  name: string;
  label: string;
  /** First validation error for this field, if any. */
  error?: string;
  /** Short help text under the input. */
  hint?: string;
  /** Prefix for the element ids, to keep them unique when a form is rendered twice. */
  idPrefix?: string;
};

/** Labelled input with an accessible error message (UX-2, UX-4). */
export function Field({ name, label, error, hint, idPrefix = "field", required, ...inputProps }: FieldProps) {
  const id = `${idPrefix}-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? null : <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClass}
        {...inputProps}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Result banner for a form or an action: success (status) or error (alert). */
export function FormMessage({ ok, children }: { ok: boolean; children: ReactNode }) {
  return ok ? (
    <p role="status" className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
      {children}
    </p>
  ) : (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      {children}
    </p>
  );
}

/** Empty state of a listing with a call to action (UX-3). */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
