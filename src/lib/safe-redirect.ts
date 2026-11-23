export const DEFAULT_REDIRECT = "/dashboard";

const BASE = "http://localhost";
const BASE_ORIGIN = new URL(BASE).origin;
const MAX_NEXT_LENGTH = 2048;

/**
 * Allow-list of private sections (D7). Checked on the FINAL, normalised
 * pathname: validating the raw input is not enough because dot segments can
 * collapse into "//host" (SEG-7).
 */
const ALLOWED_PATH = /^\/(dashboard|clientes|productos|facturas)(\/[A-Za-z0-9_-]+)*\/?$/;

/** Control chars (< 0x20, 0x7f) and backslashes are stripped or reinterpreted by browsers. */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * Returns an internal path (pathname + search + hash) to redirect to after
 * login, or "/dashboard" for anything not on the allow-list. Prevents open
 * redirects; when in doubt, the default route wins.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next === "" || next.length > MAX_NEXT_LENGTH) {
    return DEFAULT_REDIRECT;
  }
  if (hasUnsafeChars(next) || !next.startsWith("/")) return DEFAULT_REDIRECT;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (url.origin !== BASE_ORIGIN) return DEFAULT_REDIRECT;

  const { pathname } = url;
  if (pathname.startsWith("//") || pathname.startsWith("/\\") || !ALLOWED_PATH.test(pathname)) {
    return DEFAULT_REDIRECT;
  }

  return `${pathname}${url.search}${url.hash}`;
}
