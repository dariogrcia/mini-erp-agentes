import { describe, expect, it } from "vitest";
import { canTransition, computeLine, computeTotals, isLowStock, STATUS_LABEL, type InvoiceStatus } from "./invoice";
import { MAX_CENTS, type VatRate } from "./money";

describe("invoice arithmetic", () => {
  it.each([
    [3, 1250, 21, { base: 3750, vat: 788, total: 4538 }],
    [3, 5, 10, { base: 15, vat: 2, total: 17 }],
    [1, 50, 21, { base: 50, vat: 11, total: 61 }],
    [2, 13, 4, { base: 26, vat: 1, total: 27 }],
    [2, 100, 0, { base: 200, vat: 0, total: 200 }],
    [1, 0, 21, { base: 0, vat: 0, total: 0 }],
    [1, MAX_CENTS, 0, { base: MAX_CENTS, vat: 0, total: MAX_CENTS }],
  ] as const)("matches SQL for quantity %i, price %i, VAT %i", (quantity, unitPriceCents, vatRate, expected) => {
    expect(computeLine({ quantity, unitPriceCents, vatRate })).toEqual(expected);
  });

  it("sums already rounded line VAT, not VAT on the aggregate base", () => {
    expect(computeTotals([
      { quantity: 1, unitPriceCents: 5, vatRate: 10 },
      { quantity: 1, unitPriceCents: 5, vatRate: 10 },
      { quantity: 3, unitPriceCents: 1250, vatRate: 21 },
      { quantity: 1, unitPriceCents: 100, vatRate: 4 },
      { quantity: 1, unitPriceCents: 100, vatRate: 0 },
    ])).toEqual({ subtotal: 3960, vatTotal: 794, total: 4754 });
  });

  it("returns zeros for an empty invoice", () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, vatTotal: 0, total: 0 });
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, 2_147_483_648])("rejects quantity %s", (quantity) => {
    expect(() => computeLine({ quantity, unitPriceCents: 100, vatRate: 21 })).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, MAX_CENTS + 1])("rejects price cents %s", (unitPriceCents) => {
    expect(() => computeLine({ quantity: 1, unitPriceCents, vatRate: 21 })).toThrow();
  });

  it("rejects an unsupported VAT rate", () => {
    expect(() => computeLine({ quantity: 1, unitPriceCents: 100, vatRate: 5 as VatRate })).toThrow();
  });

  it("rejects overflow in the line base, line total and invoice totals", () => {
    expect(() => computeLine({ quantity: 2, unitPriceCents: MAX_CENTS, vatRate: 0 })).toThrow();
    expect(() => computeLine({ quantity: 1, unitPriceCents: MAX_CENTS, vatRate: 21 })).toThrow();
    expect(() => computeTotals([
      { quantity: 1, unitPriceCents: MAX_CENTS, vatRate: 0 },
      { quantity: 1, unitPriceCents: 1, vatRate: 0 },
    ])).toThrow();
  });

  it("does not modify its inputs", () => {
    const line = Object.freeze({ quantity: 2, unitPriceCents: 100, vatRate: 21 as const });
    expect(computeTotals(Object.freeze([line]))).toEqual({ subtotal: 200, vatTotal: 42, total: 242 });
  });
});

describe("invoice states", () => {
  const statuses: InvoiceStatus[] = ["draft", "issued", "paid", "cancelled"];
  const allowed = ["draft:issued", "draft:deleted", "issued:paid", "issued:cancelled"];
  for (const from of statuses) {
    for (const to of [...statuses, "deleted"] as const) {
      it(`checks ${from} -> ${to}`, () => {
        expect(canTransition(from, to)).toBe(allowed.includes(`${from}:${to}`));
      });
    }
  }
  it("provides Spanish labels", () => {
    expect(STATUS_LABEL).toEqual({ draft: "Borrador", issued: "Emitida", paid: "Pagada", cancelled: "Anulada" });
  });
});

describe("stock alerts", () => {
  it.each([[0, 0, true], [4, 5, true], [5, 5, true], [6, 5, false]])("compares %i with %i", (stock, threshold, expected) => {
    expect(isLowStock(stock, threshold)).toBe(expected);
  });
  it.each([-1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648])("rejects invalid stock or threshold %s", (value) => {
    expect(() => isLowStock(value, 5)).toThrow();
    expect(() => isLowStock(5, value)).toThrow();
  });
});
