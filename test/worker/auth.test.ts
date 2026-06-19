import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { jsonRequest, getRequest } from "./helpers";
import { generateResetToken } from "../../worker/routes/auth";
import { sha256Hex } from "../../worker/lib/crypto";

const SITE_PASSWORD = "correct-horse-battery-staple";

function cookieFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  return setCookie?.split(";")[0] ?? "";
}

async function register(over?: Record<string, unknown>): Promise<Response> {
  return jsonRequest("/auth/register", "POST", {
    email: `u-${crypto.randomUUID().slice(0, 8)}@test.local`,
    password: "a-good-password",
    display_name: "Tester",
    site_password: SITE_PASSWORD,
    ...over,
  });
}

describe("POST /auth/register", () => {
  it("creates a user and sets a session cookie", async () => {
    const email = `new-${crypto.randomUUID().slice(0, 8)}@test.local`;
    const res = await register({ email });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; email: string };
    expect(body.email).toBe(email);
    expect(cookieFrom(res)).toMatch(/^arb_session=/);

    const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();
    expect(row).not.toBeNull();
  });

  it("rejects a wrong site password with 403", async () => {
    const res = await register({ site_password: "nope" });
    expect(res.status).toBe(403);
  });

  it("rejects a password shorter than 10 chars", async () => {
    const res = await register({ password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await register({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing display name", async () => {
    const res = await register({ display_name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email with 409", async () => {
    const email = `dup-${crypto.randomUUID().slice(0, 8)}@test.local`;
    expect((await register({ email })).status).toBe(200);
    expect((await register({ email })).status).toBe(409);
  });

  it("rate-limits after 10 attempts per IP", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await register({ email: "bad" }); // 400, but still counts
      expect(res.status).not.toBe(429);
    }
    const res = await register({ email: "bad" });
    expect(res.status).toBe(429);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials and sets a cookie", async () => {
    const email = `login-${crypto.randomUUID().slice(0, 8)}@test.local`;
    await register({ email, password: "a-good-password" });
    const res = await jsonRequest("/auth/login", "POST", {
      email,
      password: "a-good-password",
    });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toMatch(/^arb_session=/);
  });

  it("rejects a wrong password with a generic 401", async () => {
    const email = `login2-${crypto.randomUUID().slice(0, 8)}@test.local`;
    await register({ email, password: "a-good-password" });
    const res = await jsonRequest("/auth/login", "POST", {
      email,
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
    expect((await res.json()) as { error: string }).toEqual({
      error: "Invalid email or password",
    });
  });

  it("rejects a nonexistent email with the same generic 401", async () => {
    const res = await jsonRequest("/auth/login", "POST", {
      email: "ghost@test.local",
      password: "whatever-password",
    });
    expect(res.status).toBe(401);
  });

  it("rate-limits after 5 failures for one email", async () => {
    const email = `rl-${crypto.randomUUID().slice(0, 8)}@test.local`;
    for (let i = 0; i < 5; i++) {
      const res = await jsonRequest("/auth/login", "POST", {
        email,
        password: "wrong",
      });
      expect(res.status).toBe(401);
    }
    const res = await jsonRequest("/auth/login", "POST", {
      email,
      password: "wrong",
    });
    expect(res.status).toBe(429);
  });
});

describe("GET /auth/me", () => {
  it("returns the user when authenticated", async () => {
    const email = `me-${crypto.randomUUID().slice(0, 8)}@test.local`;
    const reg = await register({ email });
    const res = await getRequest("/auth/me", cookieFrom(reg));
    expect(res.status).toBe(200);
    expect((await res.json()) as { email: string }).toMatchObject({ email });
  });

  it("returns 401 without a cookie", async () => {
    const res = await getRequest("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/change-password", () => {
  it("changes the password with the correct current password", async () => {
    const email = `cp-${crypto.randomUUID().slice(0, 8)}@test.local`;
    const reg = await register({ email, password: "original-password" });
    const cookie = cookieFrom(reg);

    const res = await jsonRequest(
      "/auth/change-password",
      "POST",
      {
        current_password: "original-password",
        new_password: "brand-new-password",
      },
      { cookie },
    );
    expect(res.status).toBe(200);

    // Old password no longer works; new one does.
    expect(
      (
        await jsonRequest("/auth/login", "POST", {
          email,
          password: "original-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await jsonRequest("/auth/login", "POST", {
          email,
          password: "brand-new-password",
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a wrong current password", async () => {
    const reg = await register();
    const res = await jsonRequest(
      "/auth/change-password",
      "POST",
      {
        current_password: "definitely-wrong",
        new_password: "another-new-password",
      },
      { cookie: cookieFrom(reg) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects a too-short new password", async () => {
    const reg = await register({ password: "original-password" });
    const res = await jsonRequest(
      "/auth/change-password",
      "POST",
      { current_password: "original-password", new_password: "short" },
      { cookie: cookieFrom(reg) },
    );
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await jsonRequest("/auth/change-password", "POST", {
      current_password: "x",
      new_password: "a-good-new-password",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/reset/:token", () => {
  it("redeems a valid admin-issued token", async () => {
    const email = `reset-${crypto.randomUUID().slice(0, 8)}@test.local`;
    const reg = await register({ email, password: "original-password" });
    const userId = ((await reg.json()) as { id: string }).id;

    const { token } = await generateResetToken(env.DB, userId, userId);
    const res = await jsonRequest(`/auth/reset/${token}`, "POST", {
      new_password: "reset-password-ok",
    });
    expect(res.status).toBe(200);

    // New password works.
    expect(
      (
        await jsonRequest("/auth/login", "POST", {
          email,
          password: "reset-password-ok",
        })
      ).status,
    ).toBe(200);

    // Token is single-use.
    const reuse = await jsonRequest(`/auth/reset/${token}`, "POST", {
      new_password: "another-password-x",
    });
    expect(reuse.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const user = await register();
    const userId = ((await user.json()) as { id: string }).id;
    const token = "expired-token-cleartext";
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare(
      "INSERT INTO password_reset_tokens (token_hash, user_id, issued_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(tokenHash, userId, userId, Date.now() - 10_000, Date.now() - 1_000)
      .run();
    const res = await jsonRequest(`/auth/reset/${token}`, "POST", {
      new_password: "should-not-apply",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    const res = await jsonRequest(`/auth/reset/does-not-exist`, "POST", {
      new_password: "a-good-password",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short new password before looking up the token", async () => {
    const res = await jsonRequest(`/auth/reset/whatever`, "POST", {
      new_password: "short",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await jsonRequest("/auth/logout", "POST", {});
    expect(res.status).toBe(200);
  });
});
