import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InvoiceEditor, type InvoiceEditorInitial } from "./InvoiceEditor";

vi.mock("@/lib/actions/invoices", () => ({ saveDraft: vi.fn() }));

const initial: InvoiceEditorInitial = {
  id: "12345678-1234-4234-8234-123456789abc",
  updatedAt: "2026-11-25T09:10:11.123456+00:00",
  customerId: "87654321-4321-4321-8321-cba987654321",
  issueDate: "2026-11-25", dueDate: null, notes: "Notas del borrador",
  lines: [{ productId: null, description: "Servicio", quantity: 2, unitPriceCents: 1250, vatRate: 21 }],
};

describe("invoice editor version", () => {
  it("renders the exact database timestamp in a hidden field", () => {
    const html = renderToStaticMarkup(createElement(InvoiceEditor, {
      customers: [{ id: initial.customerId, name: "Cliente" }], products: [],
      defaultIssueDate: initial.issueDate, initial,
    }));
    const hiddenValue = (name: string) => new RegExp(`<input(?=[^>]*type="hidden")(?=[^>]*name="${name}")[^>]*value="([^"]*)"`).exec(html)?.[1];
    expect(hiddenValue("updated_at")).toBe(initial.updatedAt);
    expect(hiddenValue("invoice_id")).toBe(initial.id);
  });

  it("does not send a version when creating a new draft", () => {
    const html = renderToStaticMarkup(createElement(InvoiceEditor, {
      customers: [], products: [], defaultIssueDate: initial.issueDate,
    }));
    expect(html).not.toContain('name="updated_at"');
    expect(html).not.toContain('name="invoice_id"');
  });
});
