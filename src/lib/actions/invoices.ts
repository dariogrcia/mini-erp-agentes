"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromCents, toCents } from "@/lib/domain/money";
import { invoiceDraftSchema, uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import { toUserMessage, type ActionState, type FieldErrors } from "./state";

const LIST_PATH = "/facturas";
const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a iniciar sesión.";
const INVALID_TARGET = "No se ha podido identificar la factura. Recarga la página e inténtalo de nuevo.";
const REVIEW_FIELDS = "Revisa los campos marcados.";
/** Defensive caps: the form never gets close, but the action is a public endpoint. */
const MAX_LINES = 200;
const MAX_NOTES_LENGTH = 2000;

/** Spanish messages for the issues whose schema message is generic or in English. */
const FIELD_MESSAGES: Record<string, string> = {
  customer_id: "Elige un cliente.",
  quantity: "La cantidad tiene que ser un número entero mayor que 0.",
  unit_price: "Precio inválido: usa hasta dos decimales y un importe no negativo.",
};

/** Repeated form fields, one entry per line and in the same order. */
const LINE_FIELDS = ["line_product_id", "line_description", "line_quantity", "line_unit_price", "line_vat_rate"] as const;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readAll(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => (typeof value === "string" ? value : ""));
}

/** "3" → 3; anything that is not a plain non-negative integer → NaN (rejected by the schema). */
function parseQuantity(value: string): number {
  const trimmed = value.trim();
  return /^\d{1,10}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Spanish ("12,50") or dot decimal price to cents; null when it cannot be parsed. */
function parsePriceCents(value: string): number | null {
  try {
    return toCents(value);
  } catch {
    return null;
  }
}

/** Field key used by the editor: "lines.0.unit_price" for the schema's "lines.0.unit_price_cents". */
function issueKey(path: readonly PropertyKey[]): string {
  return path.map((part) => (part === "unit_price_cents" ? "unit_price" : String(part))).join(".");
}

function toFieldErrors(issues: readonly z.core.$ZodIssue[], extra: FieldErrors): FieldErrors {
  const errors: FieldErrors = { ...extra };
  for (const issue of issues) {
    const key = issueKey(issue.path) || "form";
    if (errors[key]) continue;
    const leaf = key.split(".").at(-1) ?? key;
    errors[key] = [FIELD_MESSAGES[leaf] ?? issue.message];
  }
  // The totals check fails as a side effect of an invalid line; the per-line error explains it.
  if (errors.lines && Object.keys(errors).some((key) => key.startsWith("lines."))) delete errors.lines;
  return errors;
}

/**
 * Creates (no `invoice_id`) or updates (with `invoice_id`) a draft invoice through
 * the `save_draft_invoice` RPC (D3), which recomputes and stores the totals.
 * On success redirects to the invoice detail.
 */
export async function saveDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rawInvoiceId = readString(formData, "invoice_id");
  const invoiceId = rawInvoiceId === "" ? null : uuidSchema.safeParse(rawInvoiceId).data;
  if (invoiceId === undefined) return { ok: false, message: INVALID_TARGET };

  const version = invoiceId === null ? null : z.iso.datetime({ offset: true }).safeParse(formData.get("updated_at"));
  if (version && !version.success) return { ok: false, message: INVALID_TARGET };

  const columns = LINE_FIELDS.map((key) => readAll(formData, key));
  const lineCount = columns[0].length;
  if (columns.some((column) => column.length !== lineCount) || lineCount > MAX_LINES) {
    return { ok: false, message: "Las líneas de la factura no son válidas. Recarga la página e inténtalo de nuevo." };
  }

  const extraErrors: FieldErrors = {};
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const [productId, description, quantity, unitPrice, vatRate] = columns.map((column) => column[index]);
    const unitPriceCents = parsePriceCents(unitPrice);
    if (unitPriceCents === null) extraErrors[`lines.${index}.unit_price`] = [FIELD_MESSAGES.unit_price];
    return {
      product_id: productId.trim() === "" ? undefined : productId.trim(),
      description,
      quantity: parseQuantity(quantity),
      unit_price_cents: unitPriceCents ?? 0,
      vat_rate: vatRate,
    };
  });

  const notes = readString(formData, "notes");
  if (notes.length > MAX_NOTES_LENGTH) extraErrors.notes = [`Máximo ${MAX_NOTES_LENGTH} caracteres.`];

  const parsed = invoiceDraftSchema.safeParse({
    customer_id: readString(formData, "customer_id"),
    issue_date: readString(formData, "issue_date"),
    due_date: readString(formData, "due_date"),
    notes,
    lines,
  });
  if (!parsed.success || Object.keys(extraErrors).length > 0) {
    return {
      ok: false,
      message: REVIEW_FIELDS,
      fieldErrors: toFieldErrors(parsed.success ? [] : parsed.error.issues, extraErrors),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED };

  const draft = parsed.data;
  const { data: savedId, error } = await supabase.rpc("save_draft_invoice", {
    p_invoice_id: invoiceId,
    p_expected_updated_at: version?.data ?? null,
    p_customer_id: draft.customer_id,
    p_issue_date: draft.issue_date,
    p_due_date: draft.due_date ?? null,
    p_notes: draft.notes ?? null,
    // The RPC takes euros with 2 decimals; strings avoid any float rounding (D4).
    p_lines: draft.lines.map((line) => ({
      product_id: line.product_id ?? null,
      description: line.description,
      quantity: line.quantity,
      unit_price: fromCents(line.unit_price_cents),
      vat_rate: line.vat_rate,
    })),
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  const id = uuidSchema.safeParse(savedId).data;
  if (!id) return { ok: false, message: toUserMessage(null) };

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}?guardado=1`);
}

type LifecycleRpc = "issue_invoice" | "mark_invoice_paid" | "cancel_invoice";

function revalidateInvoice(id: string) {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(`${LIST_PATH}/${id}/editar`);
  revalidatePath("/dashboard");
}

/** The RPC locks the invoice and enforces ownership, transitions and stock atomically. */
async function transitionInvoice(formData: FormData, rpc: LifecycleRpc, message: string): Promise<ActionState> {
  const id = uuidSchema.safeParse(formData.get("id")).data;
  if (!id) return { ok: false, message: INVALID_TARGET };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: SESSION_EXPIRED };

  const { error } = await supabase.rpc(rpc, { p_invoice_id: id });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidateInvoice(id);
  if (rpc !== "mark_invoice_paid") revalidatePath("/productos");
  return { ok: true, message };
}

export async function issueInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return transitionInvoice(formData, "issue_invoice", "Factura emitida.");
}

export async function markPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return transitionInvoice(formData, "mark_invoice_paid", "Factura marcada como pagada.");
}

export async function cancelInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return transitionInvoice(formData, "cancel_invoice", "Factura anulada. Se ha repuesto el stock.");
}

export async function deleteDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuidSchema.safeParse(formData.get("id")).data;
  if (!id) return { ok: false, message: INVALID_TARGET };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: SESSION_EXPIRED };

  // Keep the draft check in the DELETE itself: a concurrent issue must prevent deletion.
  const { data, error } = await supabase.from("invoices").delete()
    .eq("id", id).eq("owner_id", user.id).eq("status", "draft").select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) {
    return { ok: false, message: "No se ha eliminado la factura: no existe, no tienes acceso o ya no es un borrador." };
  }

  revalidateInvoice(id);
  redirect(LIST_PATH);
}
