/**
 * Helpers for the `?q=` free-text search of the listings (customers, products).
 * Pure functions: no network or database access.
 */

export const MAX_SEARCH_LENGTH = 100;

const COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Normalises a raw `?q=` value: takes the first value if repeated, turns control
 * characters into spaces, collapses whitespace, trims and caps the length
 * (counting code points, so an emoji is never split). Anything else → "".
 */
export function normalizeSearch(input: unknown): string {
  const raw = Array.isArray(input) ? input[0] : input;
  if (typeof raw !== "string") return "";

  let cleaned = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : char;
  }
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  return Array.from(collapsed).slice(0, MAX_SEARCH_LENGTH).join("").trim();
}

/**
 * Builds a PostgREST `or` filter that matches rows where ANY of `columns`
 * contains `term` (case-insensitive). The term is treated as literal text:
 * LIKE wildcards (`%`, `_`) and the escape char are escaped, and the value is
 * double-quoted so `,`, `(`, `)` and `.` cannot inject extra filter conditions.
 * `*` is removed: PostgREST turns it into `%` even inside quotes and it can't be escaped.
 * Returns null for an empty term (no filter).
 */
export function ilikeAnyFilter(columns: readonly string[], term: string): string | null {
  if (columns.length === 0) throw new Error("At least one column is required");
  for (const column of columns) {
    if (!COLUMN_NAME.test(column)) throw new Error(`Invalid column name: ${column}`);
  }
  const literal = term.replaceAll("*", "");
  if (literal === "") return null;

  const likePattern = `%${literal.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const quoted = `"${likePattern.replace(/["\\]/g, (c) => `\\${c}`)}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
