"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCustomer } from "@/lib/actions/customers";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { newUuid } from "@/lib/domain/uuid";
import type { CustomerRow } from "@/lib/types";
import { buttonClass, Field, FormMessage } from "@/components/ui";

export type CustomerFormData = Pick<
  CustomerRow,
  "id" | "name" | "tax_id" | "email" | "phone" | "address" | "updated_at"
>;

type CustomerFormProps = {
  /** Customer to edit; omit to create a new one. */
  customer?: CustomerFormData;
  /** Id for the first new customer, generated on the server (avoids a hydration mismatch). */
  newId?: string;
  closeHref: string;
};

/**
 * Create / edit form (same component). Mount it with `key={customer?.id ?? "new"}`
 * so switching between customers resets its state.
 * - Edit sends the `updated_at` it read (D11, optimistic concurrency).
 * - Create sends an id that stays the same across retries and changes only after
 *   a successful save, so a retry after a network error never duplicates (D12).
 */
export function CustomerForm({ customer, newId, closeHref }: CustomerFormProps) {
  const [createId, setCreateId] = useState(() => newId ?? newUuid());
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveCustomer(prev, formData);
    if (result.ok && !customer) setCreateId(newUuid());
    return result;
  }, initialActionState);
  const isEdit = Boolean(customer);
  const errors = state.fieldErrors ?? {};

  // After an error React resets the form, so refill it with the submitted values.
  const value = (key: keyof Omit<CustomerFormData, "id" | "updated_at">) => state.values?.[key] ?? customer?.[key] ?? "";

  return (
    <section
      aria-labelledby="customer-form-title"
      className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="customer-form-title" className="text-lg font-semibold text-ink">
          {isEdit ? "Editar cliente" : "Nuevo cliente"}
        </h2>
        <Link href={closeHref} className={buttonClass("ghost", "sm")} aria-label="Cerrar formulario">
          Cerrar
        </Link>
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        {customer ? (
          <>
            <input type="hidden" name="mode" value="update" />
            <input type="hidden" name="id" value={customer.id} />
            <input type="hidden" name="updated_at" value={customer.updated_at} />
          </>
        ) : (
          <>
            <input type="hidden" name="mode" value="create" />
            <input type="hidden" name="id" value={createId} />
          </>
        )}

        {state.message ? <FormMessage ok={state.ok}>{state.message}</FormMessage> : null}

        <Field
          idPrefix="customer"
          name="name"
          label="Nombre o razón social"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={value("name")}
          error={errors.name?.[0]}
        />
        <Field
          idPrefix="customer"
          name="tax_id"
          label="NIF / CIF"
          maxLength={20}
          autoCapitalize="characters"
          spellCheck={false}
          hint="NIF, NIE o CIF con letra o dígito de control."
          defaultValue={value("tax_id")}
          error={errors.tax_id?.[0]}
        />
        <Field
          idPrefix="customer"
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={value("email")}
          error={errors.email?.[0]}
        />
        <Field
          idPrefix="customer"
          name="phone"
          label="Teléfono"
          type="tel"
          inputMode="tel"
          maxLength={30}
          autoComplete="tel"
          defaultValue={value("phone")}
          error={errors.phone?.[0]}
        />
        <Field
          idPrefix="customer"
          name="address"
          label="Dirección"
          maxLength={300}
          autoComplete="street-address"
          defaultValue={value("address")}
          error={errors.address?.[0]}
        />

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Link href={closeHref} className={buttonClass("secondary")}>
            Cancelar
          </Link>
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
          </button>
        </div>
      </form>
    </section>
  );
}
