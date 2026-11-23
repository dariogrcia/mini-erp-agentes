/**
 * Row types of the public schema (supabase/migrations/0001_init.sql).
 *
 * Money columns are Postgres numeric(12,2). PostgREST may serialize numeric as
 * a JSON number or as a string, so they are typed as `DbNumeric` and must be
 * converted with `toCents()` (src/lib/domain/money.ts) before any arithmetic
 * (D4). Never do float math on these values directly.
 */

export type DbNumeric = number | string;

/** ISO date "YYYY-MM-DD" (Postgres `date`). */
export type DbDate = string;

/** ISO timestamp (Postgres `timestamptz`). */
export type DbTimestamp = string;

/** Invoice states as stored in the database (D5). */
export type InvoiceStatusDb = "draft" | "issued" | "paid" | "cancelled";

/** Valid Spanish VAT rates (DB check: 0, 4, 10, 21). */
export type VatRateDb = 0 | 4 | 10 | 21;

export type CustomerRow = {
  id: string;
  owner_id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: DbTimestamp;
};

export type ProductRow = {
  id: string;
  owner_id: string;
  sku: string;
  name: string;
  unit_price: DbNumeric;
  vat_rate: VatRateDb;
  stock: number;
  low_stock_threshold: number;
  created_at: DbTimestamp;
};

export type InvoiceRow = {
  id: string;
  owner_id: string;
  customer_id: string;
  number: string | null;
  status: InvoiceStatusDb;
  issue_date: DbDate;
  due_date: DbDate | null;
  notes: string | null;
  subtotal: DbNumeric;
  vat_total: DbNumeric;
  total: DbNumeric;
  created_at: DbTimestamp;
  issued_at: DbTimestamp | null;
  paid_at: DbTimestamp | null;
  cancelled_at: DbTimestamp | null;
};

export type InvoiceLineRow = {
  id: string;
  owner_id: string;
  invoice_id: string;
  product_id: string | null;
  position: number;
  description: string;
  quantity: number;
  unit_price: DbNumeric;
  vat_rate: VatRateDb;
  line_base: DbNumeric;
  line_vat: DbNumeric;
  line_total: DbNumeric;
};
