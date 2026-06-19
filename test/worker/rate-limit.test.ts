import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { rateLimit, clientIp } from "../../worker/lib/rate-limit";

// Behavioral, not load: one small-N test that the window blocks after `limit`
// hits, plus an isolation check that distinct keys count independently.
describe("rateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    const key = `t:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit(env.RATE_LIMIT, key, 3, 60);
      expect(r.allowed).toBe(true);
    }
    const blocked = await rateLimit(env.RATE_LIMIT, key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(60);
  });

  it("tracks distinct keys independently", async () => {
    const a = `a:${crypto.randomUUID()}`;
    const b = `b:${crypto.randomUUID()}`;
    expect((await rateLimit(env.RATE_LIMIT, a, 1, 60)).allowed).toBe(true);
    expect((await rateLimit(env.RATE_LIMIT, a, 1, 60)).allowed).toBe(false);
    // b is untouched.
    expect((await rateLimit(env.RATE_LIMIT, b, 1, 60)).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://x/", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    const req = new Request("https://x/", {
      headers: { "X-Forwarded-For": "9.9.9.9, 8.8.8.8" },
    });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' when no IP headers are present", () => {
    expect(clientIp(new Request("https://x/"))).toBe("unknown");
  });
});
