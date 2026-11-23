"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { customerSchema, uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import { toUserMessage, type ActionState } from "./state";

const LIST_PATH = "/clientes";
const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a iniciar sesión.";
const NOT_FOUND = "El cliente no existe o ya se ha eliminado.";
const HAS_INVOICES = "No se puede eliminar: tiene facturas asociadas";
const CONFLICT = "Este registro ha cambiado desde que lo abriste. Recarga para ver la versión actual.";
const INVALID_TARGET = "No se ha podido identificar el cliente. Recarga la página e inténtalo de nuevo.";

const CUSTOMER_FIELDS = ["name", "tax_id", "email", "phone", "address"] as const;
/** Upper bound for echoed values; the schema enforces the real limits. */
const MAX_ECHO_LENGTH = 400;

/** Reads the customer fields as strings (missing → ""). */
function readCustomerFields(formData: FormData): Record<(typeof CUSTOMER_FIELDS)[number], string> {
  const fields = { name: "", tax_id: "", email: "", phone: "", address: "" };
  for (const key of CUSTOMER_FIELDS) {
    const value = formData.get(key);
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/** Values echoed back to refill the form after an error (React resets forms). */
function echoValues(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.slice(0, MAX_ECHO_LENGTH)]));
}

/**
 * Which row the form targets. Create carries a client-generated id (D12, idempotent
 * retries); update carries the id and the `updated_at` version it read (D11).
 */
const targetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), id: uuidSchema }),
  z.object({ mode: z.literal("update"), id: uuidSchema, updated_at: z.iso.datetime({ offset: true }) }),
]);

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** True when the user can see (and therefore owns, via RLS) the customer `id`. */
async function customerExists(supabase: SupabaseServerClient, id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await supabase.from("customers").select("id").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return !error && data !== null;
}

/** Creates a customer (mode "create") or updates it (mode "update"). */
export async function saveCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fields = readCustomerFields(formData);
  const values = echoValues(fields);

  const target = targetSchema.safeParse({
    mode: formData.get("mode"),
    id: formData.get("id"),
    updated_at: formData.get("updated_at") ?? undefined,
  });
  if (!target.success) return { ok: false, message: INVALID_TARGET, values };

  const parsed = customerSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Revisa los campos marcados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED, values };

  // Explicit nulls so that clearing an optional field on edit really clears it.
  const row = {
    name: parsed.data.name,
    tax_id: parsed.data.tax_id ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
  };
  const { id } = target.data;

  if (target.data.mode === "create") {
    const { error } = await supabase.from("customers").insert({ ...row, id, owner_id: user.id });
    // D12: a retry of an insert that already went through. The primary key is the
    // only unique constraint on customers, and the row must already be ours.
    const isReplay = error?.code === "23505" && (await customerExists(supabase, id, user.id));
    if (error && !isReplay) return { ok: false, message: toUserMessage(error), values };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .update(row)
      .eq("id", id)
      .eq("owner_id", user.id)
      .eq("updated_at", target.data.updated_at)
      .select("id");
    if (error) return { ok: false, message: toUserMessage(error), values };
    if (data.length === 0) {
      // D11: 0 rows means either it is gone or someone saved a newer version.
      const exists = await customerExists(supabase, id, user.id);
      return { ok: false, message: exists ? CONFLICT : NOT_FOUND, values };
    }
  }

  revalidatePath(LIST_PATH);
  return { ok: true, message: target.data.mode === "create" ? "Cliente creado" : "Cliente guardado" };
}

/** Deletes a customer. Customers with invoices are protected by the FK (restrict). */
export async function deleteCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsedId = uuidSchema.safeParse(formData.get("id"));
  if (!parsedId.success) return { ok: false, message: NOT_FOUND };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED };

  const { data, error } = await supabase
    .from("customers")
    .delete()
    .eq("id", parsedId.data)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    return { ok: false, message: error.code === "23503" ? HAS_INVOICES : toUserMessage(error) };
  }
  if (data.length === 0) return { ok: false, message: NOT_FOUND };

  revalidatePath(LIST_PATH);
  return { ok: true, message: "Cliente eliminado" };
}
