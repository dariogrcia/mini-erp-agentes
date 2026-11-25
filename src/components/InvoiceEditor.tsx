"use client";

import Link from "next/link";
import { startTransition, useActionState, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { saveDraft } from "@/lib/actions/invoices";
import { initialActionState, type ActionState, type FieldErrors } from "@/lib/actions/state";
import { computeLine, computeTotals, type InvoiceLineInput, type InvoiceTotals, type LineTotals } from "@/lib/domain/invoice";
import { formatEUR, fromCents, toCents, VAT_RATES, type VatRate } from "@/lib/domain/money";
import { buttonClass, FormMessage, inputClass } from "./ui";

export type EditorCustomer = { id: string; name: string };
export type EditorProduct = { id: string; sku: string; name: string; unitPriceCents: number; vatRate: VatRate };
export type EditorLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: VatRate;
};
/** Draft being edited (task 7 route `/facturas/[id]/editar`). */
export type InvoiceEditorInitial = {
  id: string;
  updatedAt: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: EditorLine[];
};

type InvoiceEditorProps = {
  customers: EditorCustomer[];
  products: EditorProduct[];
  /** Today's date (YYYY-MM-DD) computed on the server, to avoid a hydration mismatch. */
  defaultIssueDate: string;
  initial?: InvoiceEditorInitial;
};

type LineState = {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
};

const DEFAULT_VAT = "21";

/** Cents to the Spanish input format: 1250 → "12,50". */
function centsToInput(cents: number): string {
  return fromCents(cents).replace(".", ",");
}

function emptyLine(key: number): LineState {
  return { key, productId: "", description: "", quantity: "1", unitPrice: "", vatRate: DEFAULT_VAT };
}

function toLineState(line: EditorLine, key: number): LineState {
  return {
    key,
    productId: line.productId ?? "",
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: centsToInput(line.unitPriceCents),
    vatRate: String(line.vatRate),
  };
}

function parseVat(value: string): VatRate | null {
  return VAT_RATES.find((rate) => String(rate) === value) ?? null;
}

/** The line as typed, ready for computeLine, or null while it is incomplete or invalid. */
function lineInput(line: LineState): InvoiceLineInput | null {
  const vatRate = parseVat(line.vatRate);
  if (!/^\d{1,10}$/.test(line.quantity.trim()) || line.unitPrice.trim() === "" || vatRate === null) return null;
  try {
    const input = { quantity: Number(line.quantity.trim()), unitPriceCents: toCents(line.unitPrice), vatRate };
    computeLine(input); // throws on out-of-range values
    return input;
  } catch {
    return null;
  }
}

/** Invoice totals of the complete lines; null if they exceed the allowed range. */
function previewTotals(inputs: InvoiceLineInput[]): InvoiceTotals | null {
  try {
    return computeTotals(inputs);
  } catch {
    return null;
  }
}

/**
 * Draft invoice editor (create, or edit with `initial`). The live preview uses the
 * same domain functions as the database (DOM-2); the database result is the truth.
 * Submission is locked while a save is in flight and after a successful one (it
 * redirects), so a double click never creates two drafts.
 */
export function InvoiceEditor({ customers, products, defaultIssueDate, initial }: InvoiceEditorProps) {
  const baseId = useId();
  const nextKey = useRef(initial ? initial.lines.length : 1);
  const locked = useRef(false);
  const [lines, setLines] = useState<LineState[]>(() =>
    initial && initial.lines.length > 0 ? initial.lines.map(toLineState) : [emptyLine(0)],
  );
  // Line keys at the last submit: the server reports errors by line index.
  const [submittedKeys, setSubmittedKeys] = useState<number[]>([]);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveDraft(prev, formData);
    // Only reached on errors: success redirects, so the lock stays on.
    locked.current = false;
    return result;
  }, initialActionState);
  const errors = state.fieldErrors ?? {};

  const inputs = lines.map(lineInput);
  const validInputs = inputs.filter((input): input is InvoiceLineInput => input !== null);
  const totals = previewTotals(validInputs);

  function updateLine(key: number, patch: Partial<Omit<LineState, "key">>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(
      key,
      product
        ? {
            productId,
            description: product.name.slice(0, 200),
            unitPrice: centsToInput(product.unitPriceCents),
            vatRate: String(product.vatRate),
          }
        : { productId: "" },
    );
  }

  function addLine() {
    const key = nextKey.current++;
    setLines((current) => [...current, emptyLine(key)]);
  }

  function removeLine(key: number) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  function lineErrors(key: number): FieldErrors {
    const index = submittedKeys.indexOf(key);
    if (index === -1) return {};
    const prefix = `lines.${index}.`;
    return Object.fromEntries(
      Object.entries(errors)
        .filter(([field]) => field.startsWith(prefix))
        .map(([field, messages]) => [field.slice(prefix.length), messages]),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const formData = new FormData(event.currentTarget);
    setSubmittedKeys(lines.map((line) => line.key));
    startTransition(() => formAction(formData));
  }

  const cancelHref = initial ? `/facturas/${initial.id}` : "/facturas";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {initial ? <>
        <input type="hidden" name="invoice_id" value={initial.id} />
        <input type="hidden" name="updated_at" value={initial.updatedAt} />
      </> : null}
      {state.message && !state.ok ? <FormMessage ok={false}>{state.message}</FormMessage> : null}

      <HeaderFields baseId={baseId} customers={customers} initial={initial} defaultIssueDate={defaultIssueDate} errors={errors} />

      <section aria-labelledby={`${baseId}-lines-title`} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${baseId}-lines-title`} className="text-lg font-semibold text-ink">
            Líneas
          </h2>
          <button type="button" onClick={addLine} className={buttonClass("secondary", "sm")}>
            Añadir línea
          </button>
        </div>
        {errors.lines ? <FormMessage ok={false}>{errors.lines[0]}</FormMessage> : null}
        <ol className="space-y-3">
          {lines.map((line, index) => (
            <LineCard
              key={line.key}
              idPrefix={`${baseId}-line-${line.key}`}
              index={index}
              line={line}
              preview={inputs[index] ? computeLine(inputs[index]) : null}
              products={products}
              errors={lineErrors(line.key)}
              canRemove={lines.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onSelectProduct={(productId) => selectProduct(line.key, productId)}
              onRemove={() => removeLine(line.key)}
            />
          ))}
        </ol>
      </section>

      <TotalsPanel totals={totals} incomplete={validInputs.length !== lines.length} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </form>
  );
}

type HeaderFieldsProps = {
  baseId: string;
  customers: EditorCustomer[];
  initial?: InvoiceEditorInitial;
  defaultIssueDate: string;
  errors: FieldErrors;
};

/** Customer, dates and notes. Uncontrolled: the form is never reset (submit is manual). */
function HeaderFields({ baseId, customers, initial, defaultIssueDate, errors }: HeaderFieldsProps) {
  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-xs sm:grid-cols-2 sm:p-6">
      <div className="sm:col-span-2">
        <FieldShell id={`${baseId}-customer`} label="Cliente" error={errors.customer_id?.[0]}>
          <select
            id={`${baseId}-customer`}
            name="customer_id"
            defaultValue={initial?.customerId ?? ""}
            aria-invalid={errors.customer_id ? true : undefined}
            aria-describedby={errors.customer_id ? `${baseId}-customer-error` : undefined}
            className={inputClass}
          >
            <option value="">Elige un cliente…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>
      <DateField id={`${baseId}-issue`} name="issue_date" label="Fecha de emisión" defaultValue={initial?.issueDate ?? defaultIssueDate} error={errors.issue_date?.[0]} />
      <DateField id={`${baseId}-due`} name="due_date" label="Vencimiento (opcional)" defaultValue={initial?.dueDate ?? ""} error={errors.due_date?.[0]} />
      <div className="sm:col-span-2">
        <FieldShell id={`${baseId}-notes`} label="Notas (opcional)" error={errors.notes?.[0]}>
          <textarea
            id={`${baseId}-notes`}
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={initial?.notes ?? ""}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? `${baseId}-notes-error` : undefined}
            className={inputClass}
          />
        </FieldShell>
      </div>
    </section>
  );
}

function DateField({ id, name, label, defaultValue, error }: { id: string; name: string; label: string; defaultValue: string; error?: string }) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} min-w-0`}
      />
    </FieldShell>
  );
}

/** Label + control + error message (the error id is `${id}-error`). */
function FieldShell({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type LineCardProps = {
  idPrefix: string;
  index: number;
  line: LineState;
  preview: LineTotals | null;
  products: EditorProduct[];
  errors: FieldErrors;
  canRemove: boolean;
  onChange: (patch: Partial<Omit<LineState, "key">>) => void;
  onSelectProduct: (productId: string) => void;
  onRemove: () => void;
};

/** One invoice line: a stacked card on mobile, a single row of fields on desktop. */
function LineCard({ idPrefix, index, line, preview, products, errors, canRemove, onChange, onSelectProduct, onRemove }: LineCardProps) {
  const describedBy = (field: string) => (errors[field] ? `${idPrefix}-${field}-error` : undefined);
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Línea {index + 1}</p>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Quitar línea ${index + 1}`}
          className={buttonClass("dangerGhost", "sm")}
        >
          Quitar
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-12">
        <div className="col-span-3 min-w-0 lg:col-span-3">
          <FieldShell id={`${idPrefix}-product_id`} label="Producto (opcional)" error={errors.product_id?.[0]}>
            <select
              id={`${idPrefix}-product_id`}
              name="line_product_id"
              value={line.productId}
              onChange={(event) => onSelectProduct(event.target.value)}
              aria-describedby={describedBy("product_id")}
              className={inputClass}
            >
              <option value="">Concepto libre</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          </FieldShell>
        </div>
        <div className="col-span-3 min-w-0 lg:col-span-4">
          <FieldShell id={`${idPrefix}-description`} label="Descripción" error={errors.description?.[0]}>
            <input
              id={`${idPrefix}-description`}
              name="line_description"
              value={line.description}
              maxLength={200}
              onChange={(event) => onChange({ description: event.target.value })}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={describedBy("description")}
              className={inputClass}
            />
          </FieldShell>
        </div>
        <div className="col-span-1 min-w-0 lg:col-span-1">
          <FieldShell id={`${idPrefix}-quantity`} label="Cantidad" error={errors.quantity?.[0]}>
            <input
              id={`${idPrefix}-quantity`}
              name="line_quantity"
              inputMode="numeric"
              value={line.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
              aria-invalid={errors.quantity ? true : undefined}
              aria-describedby={describedBy("quantity")}
              className={`${inputClass} px-2`}
            />
          </FieldShell>
        </div>
        <div className="col-span-1 min-w-0 lg:col-span-2">
          <FieldShell id={`${idPrefix}-unit_price`} label="Precio €" error={errors.unit_price?.[0]}>
            <input
              id={`${idPrefix}-unit_price`}
              name="line_unit_price"
              inputMode="decimal"
              placeholder="0,00"
              value={line.unitPrice}
              onChange={(event) => onChange({ unitPrice: event.target.value })}
              aria-invalid={errors.unit_price ? true : undefined}
              aria-describedby={describedBy("unit_price")}
              className={`${inputClass} px-2`}
            />
          </FieldShell>
        </div>
        <div className="col-span-1 min-w-0 lg:col-span-2">
          <FieldShell id={`${idPrefix}-vat_rate`} label="IVA" error={errors.vat_rate?.[0]}>
            <select
              id={`${idPrefix}-vat_rate`}
              name="line_vat_rate"
              value={line.vatRate}
              onChange={(event) => onChange({ vatRate: event.target.value })}
              aria-describedby={describedBy("vat_rate")}
              className={`${inputClass} px-2`}
            >
              {VAT_RATES.map((rate) => (
                <option key={rate} value={String(rate)}>
                  {rate} %
                </option>
              ))}
            </select>
          </FieldShell>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap justify-end gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-muted" aria-live="polite">
        {preview ? (
          <>
            <span>Base {formatEUR(preview.base)}</span>
            <span>IVA {formatEUR(preview.vat)}</span>
            <span className="font-semibold text-ink">Total {formatEUR(preview.total)}</span>
          </>
        ) : (
          <span>Completa cantidad y precio para ver el importe.</span>
        )}
      </p>
    </li>
  );
}

function TotalsPanel({ totals, incomplete }: { totals: InvoiceTotals | null; incomplete: boolean }) {
  if (!totals) {
    return <FormMessage ok={false}>Los importes superan el límite permitido. Revisa cantidades y precios.</FormMessage>;
  }
  return (
    <section aria-label="Totales" className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:ml-auto sm:max-w-sm sm:p-6">
      <dl className="space-y-2 text-sm" aria-live="polite">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Base imponible</dt>
          <dd className="text-ink">{formatEUR(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">IVA</dt>
          <dd className="text-ink">{formatEUR(totals.vatTotal)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-semibold">
          <dt className="text-ink">Total</dt>
          <dd className="text-ink">{formatEUR(totals.total)}</dd>
        </div>
      </dl>
      {incomplete ? <p className="mt-3 text-xs text-muted">Las líneas incompletas no se suman.</p> : null}
    </section>
  );
}
