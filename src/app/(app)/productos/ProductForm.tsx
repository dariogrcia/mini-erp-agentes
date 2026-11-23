"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass, Field, FormMessage, inputClass } from "@/components/ui";
import { saveProduct } from "@/lib/actions/products";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { fromCents, toCents, VAT_RATES } from "@/lib/domain/money";
import { newUuid } from "@/lib/domain/uuid";
import type { ProductRow } from "@/lib/types";

export type ProductFormData = Pick<ProductRow,
  "id" | "sku" | "name" | "unit_price" | "vat_rate" | "stock" | "low_stock_threshold" | "updated_at"
>;

type ProductFormProps = { product?: ProductFormData; newId?: string; closeHref: string };

/** Mount with the product id as key; keep the creation id across failed attempts (D12). */
export function ProductForm({ product, newId, closeHref }: ProductFormProps) {
  const [createId, setCreateId] = useState(() => newId ?? newUuid());
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveProduct(prev, formData);
    if (result.ok && !product) setCreateId(newUuid());
    return result;
  }, initialActionState);
  const errors = state.fieldErrors ?? {};
  const defaults = {
    sku: product?.sku ?? "", name: product?.name ?? "",
    unit_price: product ? fromCents(toCents(product.unit_price)) : "",
    vat_rate: product?.vat_rate ?? 21, stock: product?.stock ?? 0,
    low_stock_threshold: product?.low_stock_threshold ?? 5,
  };
  // React resets action forms; restore submitted values on validation errors or conflicts.
  const value = (key: keyof typeof defaults) => state.values?.[key] ?? defaults[key];

  return (
    <section aria-labelledby="product-form-title" className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="product-form-title" className="text-lg font-semibold text-ink">
          {product ? "Editar producto" : "Nuevo producto"}
        </h2>
        <Link href={closeHref} className={buttonClass("ghost", "sm")} aria-label="Cerrar formulario">Cerrar</Link>
      </div>
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="mode" value={product ? "update" : "create"} />
        <input type="hidden" name="id" value={product?.id ?? createId} />
        {product ? <input type="hidden" name="updated_at" value={product.updated_at} /> : null}
        {state.message ? <FormMessage ok={state.ok}>{state.message}</FormMessage> : null}
        <Field idPrefix="product" name="sku" label="SKU" required maxLength={40} spellCheck={false}
          defaultValue={value("sku")} error={errors.sku?.[0]} />
        <Field idPrefix="product" name="name" label="Nombre" required maxLength={120}
          defaultValue={value("name")} error={errors.name?.[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field idPrefix="product" name="unit_price" label="Precio sin IVA (€)" required inputMode="decimal"
            hint="Hasta dos decimales, con coma o punto." defaultValue={value("unit_price")} error={errors.unit_price?.[0]} />
          <div className="space-y-1.5">
            <label htmlFor="product-vat_rate" className="block text-sm font-medium text-ink">IVA</label>
            <select id="product-vat_rate" name="vat_rate" required defaultValue={value("vat_rate")}
              className={inputClass} aria-invalid={Boolean(errors.vat_rate)}
              aria-describedby={errors.vat_rate ? "product-vat_rate-error" : undefined}>
              {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate} %</option>)}
            </select>
            {errors.vat_rate ? <p id="product-vat_rate-error" className="text-sm text-red-700">{errors.vat_rate[0]}</p> : null}
          </div>
          <Field idPrefix="product" name="stock" label="Stock (unidades)" required inputMode="numeric"
            defaultValue={value("stock")} error={errors.stock?.[0]} />
          <Field idPrefix="product" name="low_stock_threshold" label="Umbral de stock bajo" required inputMode="numeric"
            hint="Se avisa cuando el stock es igual o inferior al umbral."
            defaultValue={value("low_stock_threshold")} error={errors.low_stock_threshold?.[0]} />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Link href={closeHref} className={buttonClass("secondary")}>Cancelar</Link>
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </form>
    </section>
  );
}
