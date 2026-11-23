import { describe, expect, it } from "vitest";
import { invoicesToCsv, type InvoiceCsvRow } from "./csv";

const header = "\uFEFFNúmero;Fecha;Cliente;NIF;Base;IVA;Total;Estado\r\n";
const row: InvoiceCsvRow = {
  number: "2026-10000", issueDate: "2026-11-23", customerName: "Ana", taxId: "12345678Z",
  subtotalCents: 3750, vatTotalCents: 788, totalCents: 4538, status: "issued",
};

describe("invoice CSV", () => {
  it.each([
    ["=1+1", "'=1+1"], ["+1", "'+1"], ["-1", "'-1"], ["@SUM(A1)", "'@SUM(A1)"],
    ["\tformula", "'\tformula"], ["\rformula", "\"'\rformula\""],
    ['=HYPERLINK("url";"label")', '\"\'=HYPERLINK(""url"";""label"")\"'],
  ])("neutralizes text starting with a formula prefix before CSV escaping: %j", (text, escaped) => {
    expect(invoicesToCsv([{ ...row, number: text, issueDate: text, customerName: text, taxId: text }]))
      .toBe(header + `${escaped};${escaped};${escaped};${escaped};37,50;7,88;45,38;Emitida\r\n`);
  });
  it("leaves numeric amounts unchanged, including negative amounts", () => {
    expect(invoicesToCsv([{ ...row, subtotalCents: -3750, vatTotalCents: -788, totalCents: -4538 }]))
      .toBe(header + "2026-10000;2026-11-23;Ana;12345678Z;-37,50;-7,88;-45,38;Emitida\r\n");
  });
  it("preserves safe text and existing apostrophes", () => {
    expect(invoicesToCsv([{ ...row, customerName: "'=1+1", taxId: "A+B-C@D" }]))
      .toBe(header + "2026-10000;2026-11-23;'=1+1;A+B-C@D;37,50;7,88;45,38;Emitida\r\n");
  });
  it("exports UTF-8 BOM, the agreed column order and decimal commas without truncating invoice numbers", () => {
    expect(invoicesToCsv([row])).toBe(header + "2026-10000;2026-11-23;Ana;12345678Z;37,50;7,88;45,38;Emitida\r\n");
  });
  it("returns a header for an empty list", () => {
    expect(invoicesToCsv([])).toBe(header);
  });
  it("quotes semicolons, quotes and CR/LF and preserves accents", () => {
    expect(invoicesToCsv([{ ...row, customerName: 'José; "Taller"\r\nMadrid' }]))
      .toBe(header + '2026-10000;2026-11-23;"José; ""Taller""\r\nMadrid";12345678Z;37,50;7,88;45,38;Emitida\r\n');
  });
  it.each(["a;b", 'a"b', "a\nb", "a\rb"])("escapes every text column containing %j", (text) => {
    const escaped = `"${text.replaceAll('"', '""')}"`;
    expect(invoicesToCsv([{ ...row, number: text, issueDate: text, customerName: text, taxId: text }]))
      .toBe(header + `${escaped};${escaped};${escaped};${escaped};37,50;7,88;45,38;Emitida\r\n`);
  });
  it("supports absent optional data and zero amounts", () => {
    expect(invoicesToCsv([{ ...row, number: null, taxId: null, subtotalCents: 0, vatTotalCents: 0, totalCents: 0, status: "draft" }]))
      .toBe(header + ";2026-11-23;Ana;;0,00;0,00;0,00;Borrador\r\n");
  });
  it("preserves row order and labels terminal states in Spanish", () => {
    const result = invoicesToCsv([{ ...row, status: "paid" }, { ...row, number: "2026-10001", status: "cancelled" }]);
    expect(result).toBe(header + "2026-10000;2026-11-23;Ana;12345678Z;37,50;7,88;45,38;Pagada\r\n" +
      "2026-10001;2026-11-23;Ana;12345678Z;37,50;7,88;45,38;Anulada\r\n");
  });
  it.each([NaN, Infinity, -Infinity, 0.5])("rejects invalid cents %s", (value) => {
    for (const field of ["subtotalCents", "vatTotalCents", "totalCents"] as const) {
      expect(() => invoicesToCsv([{ ...row, [field]: value }])).toThrow();
    }
  });
});
