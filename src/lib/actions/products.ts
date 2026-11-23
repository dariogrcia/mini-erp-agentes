"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromCents } from "@/lib/domain/money";
import { productSchema, uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import { toUserMessage, type ActionState } from "./state";

const LIST_PATH = "/productos";
const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a iniciar sesión.";
const NOT_FOUND = "El producto no existe o ya se ha eliminado.";
const DUPLICATE_SKU = "Ya existe un producto con ese SKU";
const CONFLICT = "Este registro ha cambiado desde que lo abriste. Recarga para ver la versión actual.";
const INVALID_TARGET = "No se ha podido identificar el producto. Recarga la página e inténtalo de nuevo.";
const PRODUCT_FIELDS = ["sku", "name", "unit_price", "vat_rate", "stock", "low_stock_threshold"] as const;

const targetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), id: uuidSchema }),
  z.object({ mode: z.literal("update"), id: uuidSchema, updated_at: z.iso.datetime({ offset: true }) }),
]);

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Default name Postgres gives to unique (owner_id, sku) in 0001_init.sql.
const SKU_CONSTRAINT = "products_owner_id_sku_key";

function mutationError(error: { code?: string; message?: string }, values: Record<string, string>): ActionState {
  return error.code === "23505" && error.message?.includes(SKU_CONSTRAINT)
    ? { ok: false, message: DUPLICATE_SKU, fieldErrors: { sku: [DUPLICATE_SKU] }, values }
    : { ok: false, message: toUserMessage(error), values };
}

function findProduct(supabase: SupabaseServerClient, id: string, ownerId: string) {
  return supabase.from("products").select("id").eq("id", id).eq("owner_id", ownerId).maybeSingle();
}

export async function saveProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fields = Object.fromEntries(PRODUCT_FIELDS.map((key) => {
    const value = formData.get(key);
    return [key, typeof value === "string" ? value : ""];
  }));
  const values = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.slice(0, 400)]));
  const target = targetSchema.safeParse({
    mode: formData.get("mode"), id: formData.get("id"), updated_at: formData.get("updated_at") ?? undefined,
  });
  if (!target.success) return { ok: false, message: INVALID_TARGET, values };

  const parsed = productSchema.safeParse(fields);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    for (const key of ["stock", "low_stock_threshold"] as const) {
      if (fieldErrors[key]) fieldErrors[key] = ["Introduce un entero entre 0 y 2147483647."];
    }
    if (fieldErrors.vat_rate) fieldErrors.vat_rate = ["El IVA debe ser 0, 4, 10 o 21."];
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors, values };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED, values };

  const row = { ...parsed.data, unit_price: fromCents(parsed.data.unit_price) };
  const { id } = target.data;
  if (target.data.mode === "create") {
    const { error } = await supabase.from("products").insert({ ...row, id, owner_id: user.id });
    if (error?.code === "23505") {
      // D12: only an existing owned id makes this a replay. A SKU collision alone does not.
      const existing = await findProduct(supabase, id, user.id);
      if (existing.error) return { ok: false, message: toUserMessage(existing.error), values };
      if (!existing.data) return mutationError(error, values);
    } else if (error) {
      return mutationError(error, values);
    }
  } else {
    const { data, error } = await supabase.from("products").update(row)
      .eq("id", id).eq("owner_id", user.id)
      // Keep PostgREST's timestamp intact, including all six fractional digits (D11).
      .eq("updated_at", target.data.updated_at).select("id");
    if (error) return mutationError(error, values);
    if (data.length === 0) {
      const existing = await findProduct(supabase, id, user.id);
      if (existing.error) return { ok: false, message: toUserMessage(existing.error), values };
      return { ok: false, message: existing.data ? CONFLICT : NOT_FOUND, values };
    }
  }

  revalidatePath(LIST_PATH);
  return { ok: true, message: target.data.mode === "create" ? "Producto creado" : "Producto guardado" };
}

export async function deleteProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsedId = uuidSchema.safeParse(formData.get("id"));
  if (!parsedId.success) return { ok: false, message: NOT_FOUND };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED };

  const { data, error } = await supabase.from("products").delete()
    .eq("id", parsedId.data).eq("owner_id", user.id).select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (data.length === 0) return { ok: false, message: NOT_FOUND };

  revalidatePath(LIST_PATH);
  return { ok: true, message: "Producto eliminado" };
}
