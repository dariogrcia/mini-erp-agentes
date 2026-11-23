import { describe, expect, it } from "vitest";
import { customerSchema, invoiceDraftSchema, isValidSpanishTaxId, productSchema, uuidSchema } from "./validation";
import { MAX_CENTS } from "./money";

const id = "550e8400-e29b-41d4-a716-446655440000";
const product = { sku: " SKU-1 ", name: " Producto ", unit_price: "12,50", vat_rate: "21", stock: "0", low_stock_threshold: "5" };
const line = { description: " Servicio ", quantity: 3, unit_price_cents: 1250, vat_rate: 21 };
const draft = { customer_id: id, issue_date: "2024-02-29", lines: [line] };

describe("Spanish tax IDs", () => {
  it.each(["N", "R"])("requires a letter control for CIF type %s", (prefix) => {
    expect(isValidSpanishTaxId(`${prefix}2345678C`)).toBe(true);
    expect(isValidSpanishTaxId(`${prefix}23456783`)).toBe(false);
  });
  it.each(["K", "L", "M"])("validates special NIF type %s using its seven digits", (prefix) => {
    expect(isValidSpanishTaxId(`${prefix}1234567L`)).toBe(true);
    expect(customerSchema.parse({ name: "Ana", tax_id: ` ${prefix.toLowerCase()}1234567l ` }).tax_id)
      .toBe(`${prefix}1234567L`);
    for (const suffix of ["1234567A", "123456L", "12345678L", "12345671"]) {
      expect(isValidSpanishTaxId(`${prefix}${suffix}`)).toBe(false);
    }
  });
  it("requires a numeric control for CIF type H", () => {
    expect(isValidSpanishTaxId("H23456783")).toBe(true);
    expect(isValidSpanishTaxId("H2345678C")).toBe(false);
  });
  it("maps CIF control 9 to I, never J", () => {
    expect(isValidSpanishTaxId("P0000005I")).toBe(true);
    expect(isValidSpanishTaxId("P0000005J")).toBe(false);
    expect(isValidSpanishTaxId("P00000059")).toBe(false);
  });
  it.each(["12345678Z", "00000000T", "X1234567L", "Y1234567X", "Z1234567R",
    "B99286320", "A58818501", "P2345678C", "Q2345678C", "S2345678C", "W2345678C",
    "C23456783", "C2345678C", " b99286320 "])("accepts %s", (value) => {
    expect(isValidSpanishTaxId(value)).toBe(true);
  });
  it.each(["", "12345678A", "1234567Z", "123456789Z", "X1234567A", "Y1234567A", "Z1234567A",
    "B99286321", "B9928632J", "A5881850A", "P23456783", "Q23456783", "S23456783", "W23456783",
    "C2345678D", "I23456783", "12345678-Z", "12 345678Z"])("rejects %s", (value) => {
    expect(isValidSpanishTaxId(value)).toBe(false);
  });
});

describe("customers and UUIDs", () => {
  it("trims fields and normalizes empty optional text", () => {
    expect(customerSchema.parse({ name: " Ana ", tax_id: " ", email: "", phone: "  ", address: "" }))
      .toEqual({ name: "Ana", tax_id: undefined, email: undefined, phone: undefined, address: undefined });
    expect(customerSchema.parse({ name: "Ana" })).toEqual({ name: "Ana" });
    expect(customerSchema.parse({ name: "Ana", tax_id: " x1234567l ", email: " ana@example.com ", phone: " 123 ", address: " Calle 1 " }))
      .toEqual({ name: "Ana", tax_id: "X1234567L", email: "ana@example.com", phone: "123", address: "Calle 1" });
  });
  it.each([{ name: " " }, { name: "x".repeat(121) }, { name: "Ana", email: "bad" },
    { name: "Ana", tax_id: "12345678A" }, { name: "Ana", phone: 123 }, { name: "Ana", address: null }])("rejects invalid customer %j", (value) => {
    expect(customerSchema.safeParse(value).success).toBe(false);
  });
  it("caps the length of the optional contact fields", () => {
    const email = `${"a".repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect(customerSchema.safeParse({ name: "Ana", email, phone: "6".repeat(30), address: "x".repeat(300) }).success)
      .toBe(true);
    for (const extra of [{ email: `a${email}` }, { phone: "6".repeat(31) }, { address: "x".repeat(301) }]) {
      expect(customerSchema.safeParse({ name: "Ana", ...extra }).success).toBe(false);
    }
  });
  it("accepts a 120-character name", () => {
    expect(customerSchema.safeParse({ name: "x".repeat(120) }).success).toBe(true);
  });
  it("validates UUIDs", () => {
    expect(uuidSchema.parse(id)).toBe(id);
    for (const invalid of ["", "not-a-uuid", 123, null, id.slice(1)]) {
      expect(uuidSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("products", () => {
  it("coerces form numbers and converts the price into integer cents", () => {
    expect(productSchema.parse(product)).toEqual({ sku: "SKU-1", name: "Producto", unit_price: 1250, vat_rate: 21, stock: 0, low_stock_threshold: 5 });
  });
  it.each([0, 4, 10, 21])("accepts VAT %i as number and string", (rate) => {
    for (const vat_rate of [rate, String(rate)]) {
      expect(productSchema.parse({ ...product, vat_rate }).vat_rate).toBe(rate);
    }
  });
  it.each(["-0.01", "1.001", "1.000", "NaN", "Infinity", "10000000000", "", "abc", 12.5, NaN, Infinity])("rejects price %s", (unit_price) => {
    expect(productSchema.safeParse({ ...product, unit_price }).success).toBe(false);
  });
  it("accepts zero and the maximum SQL price", () => {
    expect(productSchema.parse({ ...product, unit_price: "0" }).unit_price).toBe(0);
    expect(productSchema.parse({ ...product, unit_price: "9999999999.99" }).unit_price).toBe(MAX_CENTS);
  });
  it.each(["stock", "low_stock_threshold", "vat_rate"] as const)("rejects malformed %s without throwing", (field) => {
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, "NaN", "Infinity", "", " ", null, true, [], {}, "0x10", "1e2"]) {
      expect(productSchema.safeParse({ ...product, [field]: value }).success).toBe(false);
    }
  });
  it.each([{ sku: " " }, { sku: "x".repeat(41) }, { name: " " }, { name: "x".repeat(121) },
    { stock: 2_147_483_648 }, { low_stock_threshold: 2_147_483_648 }, { vat_rate: 20 }])("rejects invalid product fields %j", (fields) => {
    expect(productSchema.safeParse({ ...product, ...fields }).success).toBe(false);
  });
  it("accepts SQL integer and string-length boundaries", () => {
    expect(productSchema.safeParse({ ...product, sku: "x".repeat(40), name: "x".repeat(120), stock: 2_147_483_647, low_stock_threshold: 2_147_483_647 }).success).toBe(true);
  });
});

describe("invoice drafts", () => {
  it.each(["1900-01-01", "2999-12-31"])("accepts the inclusive date boundary %s for both fields", (date) => {
    expect(invoiceDraftSchema.safeParse({ ...draft, issue_date: date, due_date: date }).success).toBe(true);
  });
  it.each(["0000-01-01", "1899-12-31", "3000-01-01", "9999-12-31"])("rejects out-of-range date %s in both fields", (date) => {
    const result = invoiceDraftSchema.safeParse({ ...draft, issue_date: date, due_date: date });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const field of ["issue_date", "due_date"]) {
        expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
      }
    }
  });
  it("trims descriptions, supports optional fields and leaves integer cents unchanged", () => {
    expect(invoiceDraftSchema.parse({ ...draft, notes: " ", due_date: "", lines: [{ ...line, product_id: id }] }))
      .toEqual({ ...draft, notes: undefined, due_date: undefined, lines: [{ ...line, description: "Servicio", product_id: id }] });
  });
  it.each(["2024-02-29", "2024-03-01", undefined, ""])("accepts due date %s", (due_date) => {
    expect(invoiceDraftSchema.safeParse({ ...draft, due_date }).success).toBe(true);
  });
  it.each(["2024-02-28", "2023-02-29", "2024-04-31", "29/02/2024", "2024-03-01T00:00:00Z"])("rejects due date %s", (due_date) => {
    const result = invoiceDraftSchema.safeParse({ ...draft, due_date });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "due_date")).toBe(true);
  });
  it.each(["", "2023-02-29", "2024-13-01", "2024-04-31"])("rejects issue date %s", (issue_date) => {
    expect(invoiceDraftSchema.safeParse({ ...draft, issue_date }).success).toBe(false);
  });
  it("rejects empty lines and invalid identifiers", () => {
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [] }).success).toBe(false);
    expect(invoiceDraftSchema.safeParse({ ...draft, customer_id: "bad" }).success).toBe(false);
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [{ ...line, product_id: "bad" }] }).success).toBe(false);
  });
  it.each(["", " ", "x".repeat(201)])("rejects description of invalid length", (description) => {
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [{ ...line, description }] }).success).toBe(false);
  });
  it("accepts descriptions of 1 and 200 characters after trimming", () => {
    for (const length of [1, 200]) {
      expect(invoiceDraftSchema.parse({ ...draft, lines: [{ ...line, description: ` ${"x".repeat(length)} ` }] }).lines[0].description).toHaveLength(length);
    }
  });
  it.each(["quantity", "unit_price_cents", "vat_rate"] as const)("rejects invalid line %s", (field) => {
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, null, true, "", "NaN", "Infinity"]) {
      expect(invoiceDraftSchema.safeParse({ ...draft, lines: [{ ...line, [field]: value }] }).success).toBe(false);
    }
  });
  it.each([{ quantity: 0 }, { quantity: "1" }, { quantity: 2_147_483_648 },
    { unit_price_cents: "100" }, { unit_price_cents: MAX_CENTS + 1 }, { vat_rate: 20 },
    { quantity: 2, unit_price_cents: MAX_CENTS, vat_rate: 0 },
    { quantity: 1, unit_price_cents: MAX_CENTS, vat_rate: 21 }])("rejects invalid line or overflow %j", (fields) => {
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [{ ...line, ...fields }] }).success).toBe(false);
  });
  it("accepts a free line and rejects aggregate overflow", () => {
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [{ ...line, unit_price_cents: 0 }] }).success).toBe(true);
    expect(invoiceDraftSchema.safeParse({ ...draft, lines: [
      { ...line, quantity: 1, unit_price_cents: MAX_CENTS, vat_rate: 0 },
      { ...line, quantity: 1, unit_price_cents: 1, vat_rate: 0 },
    ] }).success).toBe(false);
  });
});
