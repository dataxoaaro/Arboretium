import { describe, it, expect } from "vitest";
import { cacheGet, cacheSet } from "../../src/lib/offline-cache";

const key = () => `t:${crypto.randomUUID()}`;

describe("offline-cache", () => {
  it("round-trips a value and records savedAt", async () => {
    const k = key();
    await cacheSet(k, { plants: [1, 2, 3] });
    const entry = await cacheGet<{ plants: number[] }>(k);
    expect(entry?.data).toEqual({ plants: [1, 2, 3] });
    expect(typeof entry?.savedAt).toBe("number");
  });

  it("returns null for a missing key", async () => {
    expect(await cacheGet(key())).toBeNull();
  });

  it("overwrites an existing key", async () => {
    const k = key();
    await cacheSet(k, "old");
    await cacheSet(k, "new");
    expect((await cacheGet<string>(k))?.data).toBe("new");
  });
});
