/**
 * Shared result shape of every Server Action (D9) and the translation of
 * database errors to Spanish. Not a "use server" module: it only exports a
 * type, a constant and a pure function.
 */

export type FieldErrors = Partial<Record<string, string[]>>;

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values to refill the form after an error (never passwords). */
  values?: Partial<Record<string, string>>;
};

export const initialActionState: ActionState = { ok: false };

const GENERIC_MESSAGE = "Ha ocurrido un error inesperado. Inténtalo de nuevo.";

/** Business codes raised by the invoice functions (`raise exception '<CODE>'`). */
const RPC_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No se ha encontrado el registro o no tienes acceso a él.",
  INVOICE_NOT_DRAFT: "La factura ya no es un borrador y no se puede modificar.",
  INVOICE_EMPTY: "La factura tiene que tener al menos una línea.",
  INSUFFICIENT_STOCK: "No hay stock suficiente para emitir la factura.",
  INVALID_TRANSITION: "Esta acción no está permitida en el estado actual de la factura.",
  INVALID_LINE: "Hay alguna línea de la factura con datos no válidos.",
};

/** Postgres SQLSTATE codes (and PostgREST codes) we translate explicitly. */
const PG_CODE_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503": "No se puede completar la operación porque hay datos relacionados.",
  "23514": "Algún valor no cumple las reglas permitidas.",
  "23502": "Falta un dato obligatorio.",
  "22P02": "Algún dato tiene un formato no válido.",
  "22003": "Algún valor numérico está fuera del rango permitido.",
  "42501": "No tienes permiso para realizar esta acción.",
  PGRST116: "No se ha encontrado el registro o no tienes acceso a él.",
};

const MAX_SKU_LENGTH = 40;

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown };

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Turns a Supabase/Postgres error into a Spanish message for the user.
 * Never returns the raw database message (SEG-5): unknown errors map to a
 * generic text.
 */
export function toUserMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return GENERIC_MESSAGE;

  const { code, message, details } = error as ErrorLike;
  const rpcCode = readString(message);

  if (rpcCode === "INSUFFICIENT_STOCK") {
    const sku = readString(details);
    return sku ? `Stock insuficiente de ${sku.slice(0, MAX_SKU_LENGTH)}` : RPC_MESSAGES.INSUFFICIENT_STOCK;
  }
  if (rpcCode && Object.hasOwn(RPC_MESSAGES, rpcCode)) {
    return RPC_MESSAGES[rpcCode];
  }

  const pgCode = readString(code);
  if (pgCode && Object.hasOwn(PG_CODE_MESSAGES, pgCode)) {
    return PG_CODE_MESSAGES[pgCode];
  }

  return GENERIC_MESSAGE;
}
