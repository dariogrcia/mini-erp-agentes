import { describe, expect, it } from "vitest";
import { formatEUR, fromCents, MAX_CENTS, toCents, VAT_RATES, vatOf, type VatRate } from "./money";

describe("money conversions", () => {
  it("formats negative zero as zero without a minus sign", () => {
    expect(formatEUR(-0)).toBe("0,00\u00a0€");
  });
  it.each([
    ["12,50", 1250], ["12.5", 1250], [12.5, 1250], ["0", 0], [0, 0],
    ["0.29", 29], [0.29, 29], ["1.01", 101], ["-12,50", -1250],
    ["  +12.50  ", 1250], ["-0.00", 0], ["9999999999.99", MAX_CENTS],
  ])("converts %s to %i cents without decimal rounding", (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it.each(["", " ", "abc", "12€", "1.000,00", "1,2.3", "1.234", "1.230", "1.",
    "1e2", "0x10", "NaN", "Infinity", NaN, Infinity, -Infinity, 1.005,
    0.1 + 0.2, "10000000000", Number.MAX_SAFE_INTEGER])("rejects invalid price %s", (input) => {
    expect(() => toCents(input)).toThrow();
  });

  it.each([[0, "0.00"], [1, "0.01"], [1250, "12.50"], [-1, "-0.01"],
    [-1250, "-12.50"], [MAX_CENTS, "9999999999.99"]])("serializes %i cents", (input, expected) => {
    expect(fromCents(input)).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity, 0.5, MAX_CENTS + 1, -MAX_CENTS - 1])("rejects invalid cents %s", (input) => {
    expect(() => fromCents(input)).toThrow();
    expect(() => formatEUR(input)).toThrow();
    expect(() => vatOf(input, 21)).toThrow();
  });

  it.each([[0, "0,00\u00a0€"], [1250, "12,50\u00a0€"], [-1250, "-12,50\u00a0€"],
    [12345678, "123.456,78\u00a0€"]])("formats %i cents in Spanish", (input, expected) => {
    expect(formatEUR(input)).toBe(expected);
  });
});

describe("VAT rounding", () => {
  it("exposes exactly the supported VAT rates", () => {
    expect(VAT_RATES).toEqual([0, 4, 10, 21]);
  });

  // Expected cents from PostgreSQL round(base_euros * rate / 100, 2).
  it.each([
    [0, 21, 0], [100, 0, 0], [100, 4, 4], [100, 10, 10], [100, 21, 21],
    [4, 10, 0], [5, 10, 1], [6, 10, 1], [49, 21, 10], [50, 21, 11],
    [51, 21, 11], [12, 4, 0], [13, 4, 1], [MAX_CENTS, 21, 210000000000],
  ] as const)("rounds base %i at %i percent to %i", (base, rate, expected) => {
    expect(vatOf(base, rate)).toBe(expected);
  });

  it.each([-1, 1, 20, 21.5, NaN, Infinity])("rejects unsupported rate %s at runtime", (rate) => {
    expect(() => vatOf(100, rate as VatRate)).toThrow();
  });

  it("rejects a negative taxable base", () => {
    expect(() => vatOf(-5, 10)).toThrow();
  });
});
