import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelInvoice, deleteDraft, issueInvoice, markPaid, saveDraft } from "./invoices";
import { initialActionState } from "./state";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const id = "12345678-1234-4234-8234-123456789abc";
const ownerId = "87654321-4321-4321-8321-cba987654321";
const actions = [issueInvoice, markPaid, cancelInvoice, deleteDraft];

function form(value: string | Blob = id) {
  const data = new FormData();
  data.set("id", value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("invoice action boundaries", () => {
  it.each(actions)("%s rejects malformed IDs before querying", async (action) => {
    for (const input of ["", "../clientes", "//evil.test", "not-a-uuid", new Blob(["id"])]) {
      expect(await action(initialActionState, form(input))).toMatchObject({ ok: false });
    }
    expect(await action(initialActionState, new FormData())).toMatchObject({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(actions)("%s rejects missing and invalid sessions before mutating", async (action) => {
    for (const auth of [
      { data: { user: null }, error: null },
      { data: { user: { id: ownerId } }, error: { message: "raw auth error" } },
    ]) {
      mocks.getUser.mockResolvedValue(auth);
      expect(await action(initialActionState, form())).toEqual({
        ok: false, message: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
      });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("invoice lifecycle", () => {
  it.each([
    [issueInvoice, "issue_invoice", "Factura emitida."],
    [markPaid, "mark_invoice_paid", "Factura marcada como pagada."],
    [cancelInvoice, "cancel_invoice", "Factura anulada. Se ha repuesto el stock."],
  ] as const)("%s uses the atomic RPC and refreshes affected views", async (action, rpc, message) => {
    const data = form();
    data.set("owner_id", "forged-owner");
    data.set("status", "paid");
    expect(await action(initialActionState, data)).toEqual({ ok: true, message });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(rpc, { p_invoice_id: id });
    expect(mocks.from).not.toHaveBeenCalled();
    for (const path of ["/facturas", `/facturas/${id}`, `/facturas/${id}/editar`, "/dashboard"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
    if (action !== markPaid) expect(mocks.revalidatePath).toHaveBeenCalledWith("/productos");
  });

  it.each([
    [issueInvoice, "INVOICE_EMPTY", null, "La factura tiene que tener al menos una línea."],
    [issueInvoice, "INSUFFICIENT_STOCK", "CAF-001", "Stock insuficiente de CAF-001"],
    [issueInvoice, "INVOICE_NOT_DRAFT", null, "La factura ya no es un borrador y no se puede modificar."],
    [markPaid, "INVALID_TRANSITION", null, "Esta acción no está permitida en el estado actual de la factura."],
    [cancelInvoice, "INVALID_TRANSITION", null, "Esta acción no está permitida en el estado actual de la factura."],
    [issueInvoice, "NOT_FOUND", null, "No se ha encontrado el registro o no tienes acceso a él."],
    [cancelInvoice, "internal SQL details", null, "Ha ocurrido un error inesperado. Inténtalo de nuevo."],
  ] as const)("%s handles %s without reporting success", async (action, message, details, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message, details } });
    expect(await action(initialActionState, form())).toEqual({ ok: false, message: expected });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

function deleteResult(data: { id: string }[] | null, error: unknown = null) {
  const query = { delete: vi.fn(), eq: vi.fn(), select: vi.fn() };
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockResolvedValue({ data, error });
  mocks.from.mockReturnValue(query);
  return query;
}

describe("deleteDraft", () => {
  it("deletes only the owner's draft and redirects to the fixed list path", async () => {
    const query = deleteResult([{ id }]);
    const data = form();
    data.set("owner_id", "forged-owner");
    data.set("next", "https://evil.test");
    await expect(deleteDraft(initialActionState, data)).rejects.toThrow("REDIRECT:/facturas");
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("invoices");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq.mock.calls).toEqual([["id", id], ["owner_id", ownerId], ["status", "draft"]]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/facturas");
  });

  it("does not claim success if RLS or a concurrent issue prevents deletion", async () => {
    deleteResult([]);
    expect(await deleteDraft(initialActionState, form())).toEqual({
      ok: false, message: "No se ha eliminado la factura: no existe, no tienes acceso o ya no es un borrador.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("translates delete failures", async () => {
    deleteResult(null, { code: "XX000", message: "raw SQL error" });
    expect(await deleteDraft(initialActionState, form())).toEqual({
      ok: false, message: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

const version = "2026-11-25T09:10:11.123456+00:00";

function draftForm(editing = true) {
  const data = new FormData();
  if (editing) {
    data.set("invoice_id", id);
    data.set("updated_at", version);
  }
  data.set("customer_id", ownerId);
  data.set("issue_date", "2026-11-25");
  data.set("notes", "Mis notas sin guardar");
  data.set("line_product_id", "");
  data.set("line_description", "Servicio editado");
  data.set("line_quantity", "2");
  data.set("line_unit_price", "12,50");
  data.set("line_vat_rate", "21");
  return data;
}

describe("draft optimistic concurrency", () => {
  it("passes the exact version to the RPC without losing microseconds", async () => {
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    await expect(saveDraft(initialActionState, draftForm())).rejects.toThrow(`REDIRECT:/facturas/${id}?guardado=1`);
    expect(mocks.rpc).toHaveBeenCalledWith("save_draft_invoice", expect.objectContaining({
      p_invoice_id: id, p_expected_updated_at: version,
      p_lines: [{ product_id: null, description: "Servicio editado", quantity: 2, unit_price: "12.50", vat_rate: 21 }],
    }));
  });

  it("reports a stale draft without refreshing or redirecting away from unsaved edits", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "STALE_DRAFT" } });
    const data = draftForm();
    expect(await saveDraft(initialActionState, data)).toEqual({
      ok: false, message: "Este registro ha cambiado desde que lo abriste. Recarga para ver la versión actual.",
    });
    expect(data.get("notes")).toBe("Mis notas sin guardar");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([null, "", "invalid", "Infinity", "2026-02-30T12:00:00Z", new Blob([version])])("rejects a missing or invalid edit version: %s", async (value) => {
    const data = draftForm();
    if (value === null) data.delete("updated_at");
    else data.set("updated_at", value);
    expect(await saveDraft(initialActionState, data)).toMatchObject({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("creates drafts with a null expected version", async () => {
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    await expect(saveDraft(initialActionState, draftForm(false))).rejects.toThrow("REDIRECT:");
    expect(mocks.rpc).toHaveBeenCalledWith("save_draft_invoice", expect.objectContaining({
      p_invoice_id: null, p_expected_updated_at: null,
    }));
  });
});
