import { describe, expect, it } from "vitest";
import { newUuid } from "./uuid";
import { uuidSchema } from "./validation";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newUuid", () => {
  it("returns a valid v4 UUID accepted by uuidSchema", () => {
    const id = newUuid();
    expect(id).toMatch(V4);
    expect(uuidSchema.safeParse(id).success).toBe(true);
  });

  it("returns a different id on every call", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newUuid()));
    expect(ids.size).toBe(1000);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    const fill = (value: number) => ({
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        (array as unknown as Uint8Array).fill(value);
        return array;
      },
    });
    expect(newUuid(fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(newUuid(fill(0x00))).toBe("00000000-0000-4000-8000-000000000000");
    expect(uuidSchema.safeParse(newUuid(fill(0x5a))).success).toBe(true);
  });

  it("uses randomUUID when present", () => {
    const fixed = "123e4567-e89b-42d3-a456-426614174000";
    expect(newUuid({ randomUUID: () => fixed, getRandomValues: (a) => a })).toBe(fixed);
  });
});
