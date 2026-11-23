import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/clientes", "/clientes"],
    ["/clientes?q=ana&x=1", "/clientes?q=ana&x=1"],
    ["/productos?stock=bajo", "/productos?stock=bajo"],
    ["/facturas/nueva", "/facturas/nueva"],
    ["/facturas/0b7c6f3e-1d2a-4c5b-9e8f-112233445566/editar", "/facturas/0b7c6f3e-1d2a-4c5b-9e8f-112233445566/editar"],
    ["/facturas/abc#lineas", "/facturas/abc#lineas"],
    ["/clientes/", "/clientes/"],
  ])("keeps the allowed internal path %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it("normalises dot segments before checking the allow-list", () => {
    expect(safeNextPath("/a/../clientes")).toBe("/clientes");
  });

  it("falls back to the dashboard for empty or non-string input", () => {
    expect(safeNextPath("")).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeNextPath(42)).toBe(DEFAULT_REDIRECT);
  });

  it("rejects values longer than 2048 characters", () => {
    expect(safeNextPath(`/clientes?q=${"a".repeat(2048)}`)).toBe(DEFAULT_REDIRECT);
    const atLimit = `/clientes?q=${"a".repeat(2048 - "/clientes?q=".length)}`;
    expect(safeNextPath(atLimit)).toBe(atLimit);
  });

  it.each([
    ["tab (also %09 once decoded)", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["DEL", "/\u007f/evil.com"],
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["backslash after slash", "/\\/evil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["absolute https", "https://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "dashboard"],
    ["dot then double slash", "/.//evil.com"],
    ["dot-dot then double slash", "/..//evil.com"],
    ["encoded dot-dot then double slash", "/%2e%2e//evil.com"],
    ["segment, dot-dot, double slash", "/a/..//evil.com"],
    ["double slash inside allowed section", "/clientes//evil.com"],
  ])("rejects %s", (_label, next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_REDIRECT);
  });

  it.each(["/login", "/LOGIN", "/login?next=//evil.com", "/./login", "/clientes/../login", "/", "/otra", "/Clientes", "/api/facturas/export"])(
    "sends %s (login or unknown route) to the dashboard",
    (next) => {
      expect(safeNextPath(next)).toBe(DEFAULT_REDIRECT);
    },
  );
});
