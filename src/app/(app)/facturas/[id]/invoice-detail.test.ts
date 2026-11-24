import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceDetail } from "./page";
import type { InvoiceLineRow } from "@/lib/types";
import type { InvoiceStatus } from "@/lib/domain/invoice";

vi.mock("@/lib/actions/invoices", () => ({
  issueInvoice: vi.fn(), markPaid: vi.fn(), cancelInvoice: vi.fn(), deleteDraft: vi.fn(),
}));

const id = "12345678-1234-4234-8234-123456789abc";
const invoice: InvoiceDetail = {
  id, owner_id: id, customer_id: id, number: "2026-0001", status: "issued",
  issue_date: "2026-11-23", due_date: "2026-12-23", notes: "Entrega por la tarde",
  subtotal: "25.00", vat_total: "5.25", total: "30.25", created_at: "2026-11-23T12:00:00Z",
  issued_at: "2026-11-23T12:00:00Z", paid_at: null, cancelled_at: null,
  customers: { name: "Taller García", tax_id: "12345678Z", email: "taller@example.test", phone: "600000000", address: "Calle Mayor, 1" },
};
const line: InvoiceLineRow = {
  id, owner_id: id, invoice_id: id, product_id: null, position: 0, description: "Servicio",
  quantity: 2, unit_price: "12.50", vat_rate: 21, line_base: "25.00", line_vat: "5.25", line_total: "30.25",
};

function renderActions(status: InvoiceStatus) {
  return renderToStaticMarkup(createElement(InvoiceActions, { id, status }));
}

describe("invoice detail presentation", () => {
  it.each([
    ["draft", ["Editar", "Eliminar", "Emitir", "Imprimir"], ["Marcar pagada", "Anular"]],
    ["issued", ["Marcar pagada", "Anular", "Imprimir"], ["Editar", "Eliminar", "Emitir"]],
    ["paid", ["Imprimir"], ["Editar", "Eliminar", "Emitir", "Marcar pagada", "Anular"]],
    ["cancelled", ["Imprimir"], ["Editar", "Eliminar", "Emitir", "Marcar pagada", "Anular"]],
  ] as const)("exposes only the allowed controls for %s", (status, visible, hidden) => {
    const html = renderActions(status);
    for (const text of visible) expect(html).toContain(`>${text}<`);
    for (const text of hidden) expect(html).not.toContain(`>${text}<`);
    expect(html).toContain("print:hidden");
  });

  it("renders customer details, localized dates, amounts and notes", () => {
    const html = renderToStaticMarkup(createElement(InvoiceDocument, { invoice, lines: [line] }));
    for (const text of ["2026-0001", "Taller García", "12345678Z", "taller@example.test", "600000000", "Calle Mayor, 1", "23 nov 2026", "23 dic 2026", "30,25", "Entrega por la tarde"]) {
      expect(html).toContain(text);
    }
  });

  it("renders stored line and header amounts without recomputing from current prices", () => {
    const html = renderToStaticMarkup(createElement(InvoiceDocument, {
      invoice: { ...invoice, total: "99.99" }, lines: [{ ...line, line_total: "88.88" }],
    }));
    expect(html).toContain("99,99");
    expect(html).toContain("88,88");
    expect(html).not.toContain("30,25");
  });

  it("escapes user-supplied text instead of interpreting markup", () => {
    const html = renderToStaticMarkup(createElement(InvoiceDocument, {
      invoice: { ...invoice, notes: '<script>alert("x")</script>' },
      lines: [{ ...line, description: '<img src=x onerror="alert(1)">' }],
    }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("offers editing when a draft has no lines and renders table and mobile cards for populated invoices", () => {
    const empty = renderToStaticMarkup(createElement(InvoiceDocument, {
      invoice: { ...invoice, status: "draft", number: null }, lines: [],
    }));
    expect(empty).toContain("Borrador sin número");
    expect(empty).toContain("Esta factura no tiene líneas");
    expect(empty).toContain(`/facturas/${id}/editar`);
    const populated = renderToStaticMarkup(createElement(InvoiceDocument, { invoice, lines: [line] }));
    expect(populated).toContain("md:hidden print:hidden");
    expect(populated).toContain("md:table print:table");
  });
});
