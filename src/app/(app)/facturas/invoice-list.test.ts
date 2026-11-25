import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoicesPage from "./page";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));

beforeEach(() => vi.resetAllMocks());

async function renderList(status: string, name: string | null) {
  const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), overrideTypes: vi.fn() };
  for (const method of [query.select, query.order, query.limit]) method.mockReturnValue(query);
  query.overrideTypes.mockResolvedValue({ data: [{
    id: "invoice-id", number: "2026-0001", status, issue_date: "2026-11-25", total: "30.25",
    customer_name: name, customers: { name: "Cliente actual" },
  }], error: null });
  mocks.createClient.mockResolvedValue({ from: () => query });
  // Resolve the async component below the static page's Suspense boundary.
  const page = InvoicesPage({ searchParams: Promise.resolve({}), params: Promise.resolve({}) });
  const suspense = page.props.children[1] as ReactElement<{ children: ReactElement }>;
  const section = suspense.props.children as ReactElement<{ searchParams: Promise<Record<string, string>> }>;
  const render = section.type as (props: typeof section.props) => Promise<ReactNode>;
  return renderToStaticMarkup(await render(section.props));
}

describe("invoice list recipient", () => {
  it.each(["issued", "paid", "cancelled"])("shows the frozen name in cards and table for %s", async (status) => {
    const html = await renderList(status, "Cliente al emitir");
    expect(html.match(/Cliente al emitir/g)).toHaveLength(2);
    expect(html).not.toContain("Cliente actual");
  });

  it("uses the current customer only for drafts", async () => {
    const html = await renderList("draft", "Copia ignorada");
    expect(html.match(/Cliente actual/g)).toHaveLength(2);
    expect(html).not.toContain("Copia ignorada");
  });

  it("does not fall back to mutable data when the snapshot is missing", async () => {
    const html = await renderList("issued", null);
    expect(html).not.toContain("Cliente actual");
    expect(html.match(/Cliente no disponible/g)).toHaveLength(2);
  });
});
