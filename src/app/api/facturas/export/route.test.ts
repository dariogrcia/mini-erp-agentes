import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

const row = {
  id: "12345678-1234-4234-8234-123456789abc", number: "2026-0001", issue_date: "2026-11-23",
  subtotal: "37.50", vat_total: "7.88", total: "45.38", status: "issued",
  customers: { name: '=HYPERLINK("url";"Taller")', tax_id: "12345678Z" },
};
const header = "\uFEFFNúmero;Fecha;Cliente;NIF;Base;IVA;Total;Estado\r\n";

function batch(data: unknown[] | null, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), gt: vi.fn(), overrideTypes: vi.fn() };
  for (const method of [query.select, query.eq, query.neq, query.order, query.limit, query.gt]) method.mockReturnValue(query);
  query.overrideTypes.mockResolvedValue({ data, error });
  mocks.from.mockReturnValueOnce(query);
  return query;
}

async function csvText(response: Response) {
  // Response.text() strips the BOM; decoding explicitly lets the test verify it.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null });
});

describe("invoice CSV endpoint", () => {
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "owner-id" } }, error: { message: "auth detail" } },
  ])("returns 401 JSON without a verified session", async (auth) => {
    mocks.getUser.mockResolvedValue(auth);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.json()).toEqual({ message: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("exports the owner's non-drafts with BOM, Spanish amounts, escaped cells and private headers", async () => {
    const query = batch([row]);
    batch([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="facturas.csv"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(query.eq).toHaveBeenCalledWith("owner_id", "owner-id");
    expect(query.neq).toHaveBeenCalledWith("status", "draft");
    expect(await csvText(response)).toBe(header +
      '2026-0001;2026-11-23;"\'=HYPERLINK(""url"";""Taller"")";12345678Z;37,50;7,88;45,38;Emitida\r\n');
  });

  it("continues across database page limits and includes paid and cancelled invoices", async () => {
    batch([row]);
    const second = batch([{ ...row, id: "second-id", number: "2026-0002", status: "paid" }]);
    const third = batch([{ ...row, id: "third-id", number: "2026-0003", status: "cancelled" }]);
    batch([]);
    const output = await csvText(await GET());
    expect(second.gt).toHaveBeenCalledWith("id", row.id);
    expect(third.gt).toHaveBeenCalledWith("id", "second-id");
    expect(output).toContain(";Pagada\r\n");
    expect(output).toContain(";Anulada\r\n");
    expect(output.split("\r\n")).toHaveLength(5);
  });

  it("returns a valid header-only download for an empty account", async () => {
    batch([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await csvText(response)).toBe(header);
  });

  it("returns a sanitized JSON error instead of a partial CSV when a later page fails", async () => {
    batch([row]);
    batch(null, { code: "XX000", message: "secret SQL detail" });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.json()).toEqual({ message: "Ha ocurrido un error inesperado. Inténtalo de nuevo." });
  });

  it("does not export corrupt amounts as zero or expose conversion errors", async () => {
    batch([{ ...row, total: "NaN" }]);
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Ha ocurrido un error inesperado. Inténtalo de nuevo." });
  });
});
