import { describe, expect, it } from "vitest";
import { computeKpis, lowStockProducts, madridDate, monthStart, type KpiInvoice, type KpiProduct } from "./kpis";
import { MAX_CENTS } from "./money";

const NOV_15 = new Date("2026-11-15T12:00:00Z");

function kpis(invoices: KpiInvoice[], options: { products?: KpiProduct[]; customerCount?: number; now?: Date } = {}) {
  return computeKpis({
    invoices,
    products: options.products ?? [],
    customerCount: options.customerCount ?? 0,
    now: options.now ?? NOV_15,
  });
}

describe("madridDate / monthStart", () => {
  it.each([
    ["2026-11-30T22:59:59Z", "2026-11-30"], // 23:59:59 CET
    ["2026-11-30T23:00:00Z", "2026-12-01"], // midnight CET: already December in Madrid
    ["2026-12-31T23:30:00Z", "2027-01-01"], // year change
    ["2026-07-31T21:59:59Z", "2026-07-31"], // CEST (UTC+2)
    ["2026-07-31T22:00:00Z", "2026-08-01"],
  ])("%s is %s in Madrid", (iso, expected) => {
    expect(madridDate(new Date(iso))).toBe(expected);
  });

  it("returns the first day of the Madrid month", () => {
    expect(monthStart(new Date("2026-11-30T23:00:00Z"))).toBe("2026-12-01");
    expect(monthStart(NOV_15)).toBe("2026-11-01");
  });

  it("rejects an invalid date", () => {
    expect(() => madridDate(new Date("nope"))).toThrow();
  });
});

describe("computeKpis", () => {
  it("returns zeros without data", () => {
    expect(kpis([])).toEqual({ billedThisMonth: 0, pendingCollection: 0, customerCount: 0, lowStockCount: 0 });
  });

  it("bills issued and paid invoices of the current month, and only issued ones are pending", () => {
    const result = kpis([
      { status: "issued", issue_date: "2026-11-01", total: 121 },
      { status: "paid", issue_date: "2026-11-30", total: "10.50" },
      { status: "issued", issue_date: "2026-10-31", total: "100.00" }, // pending, not this month
      { status: "paid", issue_date: "2026-10-15", total: 999 }, // neither
    ]);
    expect(result.billedThisMonth).toBe(12100 + 1050);
    expect(result.pendingCollection).toBe(12100 + 10000);
  });

  it("excludes drafts and cancelled invoices from every figure", () => {
    const result = kpis([
      { status: "draft", issue_date: "2026-11-10", total: "50.00" },
      { status: "cancelled", issue_date: "2026-11-10", total: "70.00" },
    ]);
    expect(result.billedThisMonth).toBe(0);
    expect(result.pendingCollection).toBe(0);
  });

  it("uses the Madrid month at the month boundary", () => {
    const invoices: KpiInvoice[] = [
      { status: "paid", issue_date: "2026-11-30", total: "1.00" },
      { status: "paid", issue_date: "2026-12-01", total: "2.00" },
    ];
    expect(kpis(invoices, { now: new Date("2026-11-30T22:59:59Z") }).billedThisMonth).toBe(100);
    expect(kpis(invoices, { now: new Date("2026-11-30T23:00:00Z") }).billedThisMonth).toBe(200);
  });

  it("does not mix the same month of another year", () => {
    expect(kpis([{ status: "paid", issue_date: "2025-11-15", total: 5 }]).billedThisMonth).toBe(0);
  });

  it("sums PostgREST strings and numbers in exact cents", () => {
    const result = kpis([
      { status: "issued", issue_date: "2026-11-02", total: "0.10" },
      { status: "issued", issue_date: "2026-11-03", total: 0.2 },
      { status: "issued", issue_date: "2026-11-04", total: "0" },
    ]);
    expect(result.pendingCollection).toBe(30);
    expect(result.billedThisMonth).toBe(30);
  });

  it.each(["abc", "1.234", "NaN", "Infinity", Infinity, NaN])("rejects an invalid total %s", (total) => {
    expect(() => kpis([{ status: "issued", issue_date: "2026-11-01", total }])).toThrow();
  });

  it("ignores the total of excluded statuses", () => {
    expect(() => kpis([{ status: "draft", issue_date: "2026-11-01", total: "abc" }])).not.toThrow();
  });

  it.each(["2026-13-01", "2026-11", "", "15/11/2026"])("rejects an invalid issue date %s", (issue_date) => {
    expect(() => kpis([{ status: "paid", issue_date, total: 1 }])).toThrow();
  });

  it("rejects a sum beyond numeric(12,2)", () => {
    const max = (MAX_CENTS / 100).toFixed(2);
    expect(() =>
      kpis([
        { status: "issued", issue_date: "2026-11-01", total: max },
        { status: "issued", issue_date: "2026-11-01", total: "0.01" },
      ]),
    ).toThrow();
  });

  it("counts low-stock products, threshold included", () => {
    const products = [
      { stock: 0, low_stock_threshold: 0 },
      { stock: 5, low_stock_threshold: 5 },
      { stock: 6, low_stock_threshold: 5 },
    ];
    expect(kpis([], { products }).lowStockCount).toBe(2);
  });

  it("passes the customer count through and rejects invalid ones", () => {
    expect(kpis([], { customerCount: 8 }).customerCount).toBe(8);
    for (const customerCount of [-1, 1.5, NaN, Infinity]) {
      expect(() => kpis([], { customerCount })).toThrow();
    }
  });

  it("rejects an invalid now", () => {
    expect(() => kpis([], { now: new Date(Number.NaN) })).toThrow();
  });
});

describe("lowStockProducts", () => {
  const products = [
    { sku: "A", stock: 4, low_stock_threshold: 5 },
    { sku: "B", stock: 50, low_stock_threshold: 5 },
    { sku: "C", stock: 0, low_stock_threshold: 2 },
    { sku: "D", stock: 2, low_stock_threshold: 2 },
  ];

  it("keeps only low-stock products, least stock first, up to the limit", () => {
    expect(lowStockProducts(products, 2).map((p) => p.sku)).toEqual(["C", "D"]);
    expect(lowStockProducts(products, 10).map((p) => p.sku)).toEqual(["C", "D", "A"]);
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(products);
    lowStockProducts(products, 5);
    expect(products).toEqual(copy);
  });

  it("handles empty lists and a zero limit", () => {
    expect(lowStockProducts([], 5)).toEqual([]);
    expect(lowStockProducts(products, 0)).toEqual([]);
  });

  it("rejects an invalid limit or stock", () => {
    expect(() => lowStockProducts(products, -1)).toThrow();
    expect(() => lowStockProducts([{ stock: -1, low_stock_threshold: 0 }], 5)).toThrow();
  });
});
