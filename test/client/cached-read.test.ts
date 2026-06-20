import { describe, it, expect, vi } from "vitest";
import { cachedRead } from "../../src/lib/cached-read";
import { ApiCallError } from "../../src/lib/api";

const key = () => `cr:${crypto.randomUUID()}`;

describe("cachedRead", () => {
  it("returns fresh network data and caches it", async () => {
    const k = key();
    const res = await cachedRead(k, async () => ["a", "b"]);
    expect(res).toMatchObject({ data: ["a", "b"], fromCache: false });
    expect(typeof res.savedAt).toBe("number");
  });

  it("serves cached data when the network fails", async () => {
    const k = key();
    await cachedRead(k, async () => ["cached"]); // seed
    const res = await cachedRead(k, async () => {
      throw new TypeError("Failed to fetch"); // offline
    });
    expect(res.fromCache).toBe(true);
    expect(res.data).toEqual(["cached"]);
  });

  it("rethrows when offline and nothing is cached", async () => {
    await expect(
      cachedRead(key(), async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("rethrows ApiCallError without falling back to cache", async () => {
    const k = key();
    await cachedRead(k, async () => "fresh"); // cache exists
    const fetcher = vi.fn(async () => {
      throw new ApiCallError("Not found", 404);
    });
    await expect(cachedRead(k, fetcher)).rejects.toBeInstanceOf(ApiCallError);
  });
});
