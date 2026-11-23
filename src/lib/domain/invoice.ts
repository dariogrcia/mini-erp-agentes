import { MAX_CENTS, vatOf, type VatRate } from "./money";

export type InvoiceLineInput = { quantity: number; unitPriceCents: number; vatRate: VatRate };
export type LineTotals = { base: number; vat: number; total: number };
export type InvoiceTotals = { subtotal: number; vatTotal: number; total: number };

function assertAmount(amount: number): void {
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_CENTS) {
    throw new Error("Importe inválido o fuera de rango");
  }
}

export function computeLine({ quantity, unitPriceCents, vatRate }: InvoiceLineInput): LineTotals {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647) {
    throw new Error("La cantidad debe ser un entero positivo dentro de rango");
  }
  assertAmount(unitPriceCents);
  const base = quantity * unitPriceCents;
  assertAmount(base);
  const vat = vatOf(base, vatRate);
  const total = base + vat;
  assertAmount(total);
  return { base, vat, total };
}

export function computeTotals(lines: readonly InvoiceLineInput[]): InvoiceTotals {
  return lines.reduce<InvoiceTotals>((totals, input) => {
    const line = computeLine(input);
    const result = {
      subtotal: totals.subtotal + line.base,
      vatTotal: totals.vatTotal + line.vat,
      total: totals.total + line.total,
    };
    assertAmount(result.subtotal);
    assertAmount(result.vatTotal);
    assertAmount(result.total);
    return result;
  }, { subtotal: 0, vatTotal: 0, total: 0 });
}

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";
export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Borrador", issued: "Emitida", paid: "Pagada", cancelled: "Anulada",
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus | "deleted"): boolean {
  return (from === "draft" && (to === "issued" || to === "deleted")) ||
    (from === "issued" && (to === "paid" || to === "cancelled"));
}

export function isLowStock(stock: number, threshold: number): boolean {
  for (const value of [stock, threshold]) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 2_147_483_647) {
      throw new Error("El stock y el umbral deben ser enteros no negativos dentro de rango");
    }
  }
  return stock <= threshold;
}
