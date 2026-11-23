import type { InvoiceStatus } from "./invoice";
import { isLowStock } from "./invoice";
import { MAX_CENTS, toCents } from "./money";

/** Business calendar of the app: months are counted in Spanish peninsular time. */
export const KPI_TIME_ZONE = "Europe/Madrid";

export type KpiInvoice = { status: InvoiceStatus; issue_date: string; total: number | string };
export type KpiProduct = { stock: number; low_stock_threshold: number };

export type Kpis = {
  /** Issued + paid invoices whose issue_date falls in the current month (cents). */
  billedThisMonth: number;
  /** Issued (not yet paid) invoices of any date (cents). */
  pendingCollection: number;
  customerCount: number;
  lowStockCount: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const madridDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KPI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date "YYYY-MM-DD" of `now` in Europe/Madrid. */
export function madridDate(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Fecha inválida");
  }
  const parts = Object.fromEntries(madridDateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** First day "YYYY-MM-01" of the Madrid month that contains `now`. */
export function monthStart(now: Date): string {
  return `${madridDate(now).slice(0, 7)}-01`;
}

function monthOf(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  const month = match ? Number(match[2]) : 0;
  const day = match ? Number(match[3]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("Fecha de emisión inválida");
  }
  return `${match[1]}-${match[2]}`;
}

function addCents(sum: number, cents: number): number {
  const result = sum + cents;
  if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_CENTS) {
    throw new Error("Importe fuera de rango");
  }
  return result;
}

function assertCount(value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("Se esperaba un entero no negativo");
  }
}

/**
 * Dashboard figures. Pure: `now` is injected so month boundaries are testable.
 * Money comes from numeric(12,2) (number or string from PostgREST) and is summed in cents (D4).
 * Drafts and cancelled invoices never count.
 */
export function computeKpis(input: {
  invoices: readonly KpiInvoice[];
  products: readonly KpiProduct[];
  customerCount: number;
  now: Date;
}): Kpis {
  assertCount(input.customerCount);
  const currentMonth = madridDate(input.now).slice(0, 7);

  let billedThisMonth = 0;
  let pendingCollection = 0;
  for (const invoice of input.invoices) {
    if (invoice.status !== "issued" && invoice.status !== "paid") continue;
    const cents = toCents(invoice.total);
    if (invoice.status === "issued") pendingCollection = addCents(pendingCollection, cents);
    if (monthOf(invoice.issue_date) === currentMonth) billedThisMonth = addCents(billedThisMonth, cents);
  }

  return {
    billedThisMonth,
    pendingCollection,
    customerCount: input.customerCount,
    lowStockCount: input.products.filter((p) => isLowStock(p.stock, p.low_stock_threshold)).length,
  };
}

/** The `limit` products with the least stock among those at or below their threshold. */
export function lowStockProducts<T extends KpiProduct>(products: readonly T[], limit: number): T[] {
  assertCount(limit);
  return products
    .filter((p) => isLowStock(p.stock, p.low_stock_threshold))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, limit);
}
