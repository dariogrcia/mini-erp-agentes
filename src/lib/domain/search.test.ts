import { describe, expect, it } from "vitest";
import { ilikeAnyFilter, MAX_SEARCH_LENGTH, normalizeSearch } from "./search";

describe("normalizeSearch", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearch("  Ana   García  ")).toBe("Ana García");
  });

  it("returns an empty string for missing or non-string values", () => {
    expect(normalizeSearch(undefined)).toBe("");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch(42)).toBe("");
    expect(normalizeSearch({})).toBe("");
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("   ")).toBe("");
    expect(normalizeSearch([])).toBe("");
  });

  it("uses the first value when the parameter is repeated", () => {
    expect(normalizeSearch(["ana", "luis"])).toBe("ana");
    expect(normalizeSearch([7, "luis"])).toBe("");
  });

  it("replaces control characters with spaces", () => {
    expect(normalizeSearch("Ana\tGarcía\r\n\u0000S.L.\u007f")).toBe("Ana García S.L.");
  });

  it("caps the length without splitting characters", () => {
    expect(normalizeSearch("x".repeat(500))).toHaveLength(MAX_SEARCH_LENGTH);
    expect(normalizeSearch("x".repeat(MAX_SEARCH_LENGTH))).toHaveLength(MAX_SEARCH_LENGTH);
    const emojis = normalizeSearch("😀".repeat(150));
    expect(Array.from(emojis)).toHaveLength(MAX_SEARCH_LENGTH);
    expect(emojis).toBe("😀".repeat(MAX_SEARCH_LENGTH));
  });

  it("does not leave a trailing space after capping", () => {
    expect(normalizeSearch(`${"a".repeat(MAX_SEARCH_LENGTH - 1)} b`)).toBe("a".repeat(MAX_SEARCH_LENGTH - 1));
  });
});

describe("ilikeAnyFilter", () => {
  it("builds a quoted contains filter for every column", () => {
    expect(ilikeAnyFilter(["name", "tax_id"], "ana")).toBe('name.ilike."%ana%",tax_id.ilike."%ana%"');
  });

  it("returns null for an empty term", () => {
    expect(ilikeAnyFilter(["name"], "")).toBeNull();
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(ilikeAnyFilter(["name"], "50%_off")).toBe(String.raw`name.ilike."%50\\%\\_off%"`);
  });

  it("drops * because PostgREST treats it as a wildcard", () => {
    expect(ilikeAnyFilter(["name"], "a*b")).toBe('name.ilike."%ab%"');
    expect(ilikeAnyFilter(["name"], "**")).toBeNull();
  });

  it("escapes backslashes and double quotes", () => {
    expect(ilikeAnyFilter(["name"], String.raw`a\b`)).toBe(String.raw`name.ilike."%a\\\\b%"`);
    expect(ilikeAnyFilter(["name"], 'say "hi"')).toBe(String.raw`name.ilike."%say \"hi\"%"`);
  });

  it("keeps PostgREST separators inside the quoted value", () => {
    const filter = ilikeAnyFilter(["name"], "a,b).or(id.eq.x");
    expect(filter).toBe('name.ilike."%a,b).or(id.eq.x%"');
  });

  it("rejects unsafe or missing column names", () => {
    expect(() => ilikeAnyFilter([], "ana")).toThrow();
    expect(() => ilikeAnyFilter(["name,id"], "ana")).toThrow();
    expect(() => ilikeAnyFilter(["Name"], "ana")).toThrow();
    expect(() => ilikeAnyFilter(["name.eq"], "ana")).toThrow();
  });
});
