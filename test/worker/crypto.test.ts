import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  dummyVerify,
  timingSafeEqual,
  sha256Hex,
  randomToken,
  signJwt,
  verifyJwt,
} from "../../worker/lib/crypto";

describe("password hashing", () => {
  it("produces a self-describing pbkdf2 string", async () => {
    const stored = await hashPassword("hunter2-long-enough");
    const parts = stored.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2-sha256");
    expect(parts[1]).toBe("100000");
  });

  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("the-right-password");
    expect(await verifyPassword("the-right-password", stored)).toBe(true);
    expect(await verifyPassword("the-wrong-password", stored)).toBe(false);
  });

  it("produces a different salt (and hash) each call", async () => {
    const a = await hashPassword("same-password-xx");
    const b = await hashPassword("same-password-xx");
    expect(a).not.toBe(b);
  });

  it("returns false on malformed stored strings", async () => {
    expect(await verifyPassword("pw", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("pw", "wrong-scheme$600000$a$b")).toBe(false);
    expect(await verifyPassword("pw", "pbkdf2-sha256$1$a$b")).toBe(false); // iters too low
    expect(await verifyPassword("pw", "pbkdf2-sha256$600000$!!!$!!!")).toBe(
      false,
    );
  });

  it("dummyVerify resolves without throwing (timing leveler)", async () => {
    await expect(dummyVerify("anything")).resolves.toBeUndefined();
  });
});

describe("timingSafeEqual", () => {
  it("is true only for identical equal-length byte arrays", () => {
    const a = new TextEncoder().encode("abc");
    const b = new TextEncoder().encode("abc");
    const c = new TextEncoder().encode("abd");
    const d = new TextEncoder().encode("abcd");
    expect(timingSafeEqual(a, b)).toBe(true);
    expect(timingSafeEqual(a, c)).toBe(false);
    expect(timingSafeEqual(a, d)).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("token-abc")).toBe(await sha256Hex("token-abc"));
  });
});

describe("randomToken", () => {
  it("returns url-safe tokens that differ each call", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("JWT sign/verify", () => {
  const secret = "test-secret-key";

  it("round-trips a payload", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "user-1", exp }, secret);
    const payload = await verifyJwt(token, secret);
    expect(payload?.sub).toBe("user-1");
    expect(typeof payload?.iat).toBe("number");
  });

  it("rejects a token signed with a different secret", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "user-1", exp }, secret);
    expect(await verifyJwt(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "user-1", exp }, secret);
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
    expect(await verifyJwt(tampered, secret)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const token = await signJwt({ sub: "user-1", exp }, secret);
    expect(await verifyJwt(token, secret)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyJwt("a.b", secret)).toBeNull();
    expect(await verifyJwt("not-a-jwt", secret)).toBeNull();
  });
});
