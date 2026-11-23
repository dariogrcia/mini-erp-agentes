import { z } from "zod";
import { computeTotals } from "./invoice";
import { MAX_CENTS, toCents, VAT_RATES } from "./money";

export const uuidSchema = z.uuid({ error: "Identificador inválido" });

export function isValidSpanishTaxId(s: string): boolean {
  const value = s.trim().toUpperCase();
  const personal = /^(\d{8}|[XYZKLM]\d{7})([A-Z])$/.exec(value);
  if (personal) {
    const digits = personal[1]
      .replace(/^[KLM]/, "")
      .replace(/^[XYZ]/, (letter) => String("XYZ".indexOf(letter)));
    return "TRWAGMYFPDXBNJZSQVHLCKE"[Number(digits) % 23] === personal[2];
  }

  const company = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(value);
  if (!company) return false;
  let sum = 0;
  for (let index = 0; index < company[2].length; index++) {
    const digit = Number(company[2][index]);
    const doubled = digit * 2;
    sum += index % 2 === 0 ? Math.floor(doubled / 10) + doubled % 10 : digit;
  }
  const control = (10 - sum % 10) % 10;
  const digitMatches = company[3] === String(control);
  const letterMatches = company[3] === "JABCDEFGHI"[control];
  if ("ABEH".includes(company[1])) return digitMatches;
  if ("NPQRSW".includes(company[1])) return letterMatches;
  return digitMatches || letterMatches;
}

function optionalText(schema: z.ZodType<string> = z.string()) {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim() || undefined;
  }, schema.optional());
}

export const customerSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Máximo 120 caracteres"),
  tax_id: optionalText(z.string().toUpperCase().refine(isValidSpanishTaxId, "NIF, NIE o CIF inválido")),
  email: optionalText(z.string().max(254, "Máximo 254 caracteres").email("Correo electrónico inválido")),
  phone: optionalText(z.string().max(30, "Máximo 30 caracteres")),
  address: optionalText(z.string().max(300, "Máximo 300 caracteres")),
});

// Restrict coercion to actual numbers and nonempty decimal strings, never null/booleans.
const numericInput = z.union([
  z.number(),
  z.string().trim().regex(/^\d+$/, "Introduce un número entero"),
]).pipe(z.coerce.number());
const nonnegativeInteger = numericInput.pipe(z.number().int().min(0).max(2_147_483_647));
const vatRateSchema = numericInput.pipe(z.union(VAT_RATES.map((rate) => z.literal(rate)), {
  error: "El IVA debe ser 0, 4, 10 o 21",
}));

export const productSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio").max(40, "Máximo 40 caracteres"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Máximo 120 caracteres"),
  unit_price: z.string().transform((value, ctx) => {
    try {
      const cents = toCents(value);
      if (cents < 0) throw new Error("Precio negativo");
      return cents;
    } catch {
      ctx.addIssue({ code: "custom", message: "Precio inválido: usa hasta dos decimales y un importe no negativo" });
      return z.NEVER;
    }
  }),
  vat_rate: vatRateSchema,
  stock: nonnegativeInteger,
  low_stock_threshold: nonnegativeInteger,
});

const invoiceDateSchema = z.iso.date({ error: "Fecha inválida" }).refine(
  (date) => date >= "1900-01-01" && date <= "2999-12-31",
  "La fecha debe estar entre 1900-01-01 y 2999-12-31",
);

export const invoiceDraftSchema = z.object({
  customer_id: uuidSchema,
  issue_date: invoiceDateSchema,
  due_date: optionalText(invoiceDateSchema),
  notes: optionalText(),
  lines: z.array(z.object({
    product_id: uuidSchema.optional(),
    description: z.string().trim().min(1, "La descripción es obligatoria").max(200, "Máximo 200 caracteres"),
    quantity: z.number().int().min(1).max(2_147_483_647),
    unit_price_cents: z.number().int().min(0).max(MAX_CENTS),
    vat_rate: vatRateSchema,
  })).min(1, "Añade al menos una línea"),
}).superRefine((draft, ctx) => {
  if (draft.due_date && draft.due_date < draft.issue_date) {
    ctx.addIssue({ code: "custom", path: ["due_date"], message: "El vencimiento no puede ser anterior a la emisión" });
  }
  try {
    computeTotals(draft.lines.map((line) => ({
      quantity: line.quantity, unitPriceCents: line.unit_price_cents, vatRate: line.vat_rate,
    })));
  } catch {
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Los importes de la factura son inválidos o exceden el límite permitido" });
  }
});
