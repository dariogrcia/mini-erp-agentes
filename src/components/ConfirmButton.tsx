"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { buttonClass } from "./ui";

type ConfirmButtonProps = {
  /** Server Action with the ActionState shape (D9). */
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Hidden inputs sent with the action, e.g. `{ id }`. */
  fields: Record<string, string>;
  /** Text of the first button, e.g. "Eliminar". */
  label: string;
  /** Accessible name of the first button, e.g. "Eliminar cliente Acme" (UX-4). */
  ariaLabel?: string;
  /** Question shown in the confirmation step. */
  question?: string;
  /** Text of the button that really runs the action. */
  confirmLabel?: string;
  pendingLabel?: string;
};

/**
 * Destructive action with an inline two-step confirmation (UX-6): the first
 * click only asks; "Sí, …" runs the action; "Cancelar" or Escape go back.
 * Shows the action's error message (e.g. a FK restriction) next to the button.
 */
export function ConfirmButton({
  action,
  fields,
  label,
  ariaLabel,
  question = "¿Seguro? No se puede deshacer.",
  confirmLabel = `Sí, ${label.toLowerCase()}`,
  pendingLabel = "Eliminando…",
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    setConfirming(false);
    return result;
  }, initialActionState);

  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const messageId = useId();

  // Move focus into the confirmation step and back to the trigger afterwards.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const error = !state.ok && state.message ? state.message : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirming ? (
        <form
          action={formAction}
          className="flex flex-wrap items-center justify-end gap-2"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) setConfirming(false);
          }}
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <span className="min-w-0 break-words text-sm text-ink" id={`${messageId}-question`}>
            {question}
          </span>
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className={buttonClass("secondary", "sm")}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            aria-describedby={`${messageId}-question`}
            className={buttonClass("danger", "sm")}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </form>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-describedby={error ? `${messageId}-error` : undefined}
          onClick={() => setConfirming(true)}
          className={buttonClass("dangerGhost", "sm")}
        >
          {label}
        </button>
      )}
      {error ? (
        <p id={`${messageId}-error`} role="alert" className="max-w-xs text-right text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
