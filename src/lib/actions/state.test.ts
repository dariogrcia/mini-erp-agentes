import { describe, expect, it } from "vitest";
import { toUserMessage } from "./state";

const rpcError = (message: string, details: string | null = null) => ({
  code: "P0001",
  message,
  details,
  hint: null,
});

describe("toUserMessage", () => {
  it("translates every business code raised by the invoice functions", () => {
    expect(toUserMessage(rpcError("NOT_FOUND"))).toBe(
      "No se ha encontrado el registro o no tienes acceso a él.",
    );
    expect(toUserMessage(rpcError("INVOICE_NOT_DRAFT"))).toBe(
      "La factura ya no es un borrador y no se puede modificar.",
    );
    expect(toUserMessage(rpcError("INVOICE_EMPTY"))).toBe(
      "La factura tiene que tener al menos una línea.",
    );
    expect(toUserMessage(rpcError("INVALID_TRANSITION"))).toBe(
      "Esta acción no está permitida en el estado actual de la factura.",
    );
    expect(toUserMessage(rpcError("INVALID_LINE"))).toBe(
      "Hay alguna línea de la factura con datos no válidos.",
    );
  });

  it("includes the sku from the detail on INSUFFICIENT_STOCK", () => {
    expect(toUserMessage(rpcError("INSUFFICIENT_STOCK", "CAF-001"))).toBe(
      "Stock insuficiente de CAF-001",
    );
  });

  it("falls back to a generic stock message when the detail is missing or blank", () => {
    const expected = "No hay stock suficiente para emitir la factura.";
    expect(toUserMessage(rpcError("INSUFFICIENT_STOCK"))).toBe(expected);
    expect(toUserMessage(rpcError("INSUFFICIENT_STOCK", "   "))).toBe(expected);
  });

  it("translates Postgres constraint errors by code without leaking the raw message", () => {
    const raw = (code: string) => ({
      code,
      message: `duplicate key value violates unique constraint "products_owner_id_sku_key"`,
      details: "Key (owner_id, sku)=(…) already exists.",
    });
    expect(toUserMessage(raw("23505"))).toBe("Ya existe un registro con esos datos.");
    expect(toUserMessage(raw("23503"))).toBe(
      "No se puede completar la operación porque hay datos relacionados.",
    );
    expect(toUserMessage(raw("23514"))).toBe("Algún valor no cumple las reglas permitidas.");
    expect(toUserMessage(raw("23505"))).not.toContain("constraint");
  });

  it("returns a generic message for unknown codes, never the raw text", () => {
    const message = toUserMessage({ code: "XX000", message: "internal error at line 42" });
    expect(message).toBe("Ha ocurrido un error inesperado. Inténtalo de nuevo.");
    expect(toUserMessage(rpcError("SOMETHING_ELSE"))).not.toContain("SOMETHING_ELSE");
  });

  it("handles non-object and empty inputs", () => {
    const generic = "Ha ocurrido un error inesperado. Inténtalo de nuevo.";
    expect(toUserMessage(null)).toBe(generic);
    expect(toUserMessage(undefined)).toBe(generic);
    expect(toUserMessage("NOT_FOUND")).toBe(generic);
    expect(toUserMessage({})).toBe(generic);
    expect(toUserMessage(new Error("boom"))).toBe(generic);
  });

  it("does not treat inherited object keys as business codes", () => {
    expect(toUserMessage({ message: "toString" })).toBe(
      "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
    );
  });
});
