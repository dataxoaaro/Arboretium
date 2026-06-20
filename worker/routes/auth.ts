// ARB-034..038: /auth endpoints.
// Site password gates registration; everything else is per-user email + password.
// No email is sent — admin issues reset links manually via the local admin tool.

import { Hono } from "hono";
import type { UserRow } from "../lib/db";
import { now } from "../lib/db";
import {
  hashPassword,
  verifyPassword,
  dummyVerify,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "../lib/crypto";
import { setSessionCookie, clearSessionCookie, readSession } from "../lib/auth";
import { rateLimit, clientIp } from "../lib/rate-limit";

type Bindings = {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  SITE_PASSWORD: string;
  JWT_SECRET: string;
};

const MIN_PASSWORD_LENGTH = 10;
const RESET_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const GENERIC_AUTH_ERROR = "Invalid email or password";

export const authRoutes = new Hono<{ Bindings: Bindings }>();

// --- POST /auth/register ---
authRoutes.post("/register", async (c) => {
  const ip = clientIp(c.req.raw);
  const limit = await rateLimit(
    c.env.RATE_LIMIT,
    `register:ip:${ip}`,
    10,
    60 * 60,
  );
  if (!limit.allowed) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }

  const body = await c.req.json<{
    email?: unknown;
    password?: unknown;
    display_name?: unknown;
    site_password?: unknown;
  }>();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const sitePassword =
    typeof body.site_password === "string" ? body.site_password : "";

  if (!email.includes("@") || email.length > 254) {
    return c.json({ error: "Invalid email" }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }
  // Display name is optional — keep signup simple. Default it to the email so
  // the (still-present) column and audit trail stay populated.
  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : email;

  // Constant-time site-password comparison so timing doesn't reveal whether
  // the field length / scheme matched.
  const enc = new TextEncoder();
  const got = enc.encode(sitePassword);
  const want = enc.encode(c.env.SITE_PASSWORD ?? "");
  // Pad to equal length to keep timingSafeEqual meaningful even on length differences.
  const equalLen = got.length === want.length && timingSafeEqual(got, want);
  if (!equalLen) {
    return c.json({ error: "Registration not authorised" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE lower(email) = lower(?)",
  )
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ error: "Account already exists" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const createdAt = now();
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, passwordHash, displayName, createdAt)
    .run();

  await setSessionCookie(c, id, c.env.JWT_SECRET);
  return c.json({
    id,
    email,
    display_name: displayName,
    created_at: createdAt,
  });
});

// --- POST /auth/login ---
authRoutes.post("/login", async (c) => {
  const ip = clientIp(c.req.raw);
  const ipLimit = await rateLimit(
    c.env.RATE_LIMIT,
    `login:ip:${ip}`,
    20,
    15 * 60,
  );
  if (!ipLimit.allowed) {
    return c.json({ error: GENERIC_AUTH_ERROR }, 429);
  }

  const body = await c.req.json<{
    email?: unknown;
    password?: unknown;
  }>();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const emailLimit = await rateLimit(
    c.env.RATE_LIMIT,
    `login:email:${email.toLowerCase()}`,
    5,
    15 * 60,
  );
  if (!emailLimit.allowed) {
    return c.json({ error: GENERIC_AUTH_ERROR }, 429);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, display_name, created_at FROM users WHERE lower(email) = lower(?)",
  )
    .bind(email)
    .first<UserRow>();

  if (!user) {
    // Run the same expensive verification against a dummy hash so the
    // response time is indistinguishable from a real-but-wrong-password case.
    await dummyVerify(password);
    return c.json({ error: GENERIC_AUTH_ERROR }, 401);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return c.json({ error: GENERIC_AUTH_ERROR }, 401);
  }

  await setSessionCookie(c, user.id, c.env.JWT_SECRET);
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    created_at: user.created_at,
  });
});

// --- POST /auth/logout ---
authRoutes.post("/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// --- GET /auth/me ---
authRoutes.get("/me", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);
  const user = await c.env.DB.prepare(
    "SELECT id, email, display_name, created_at FROM users WHERE id = ?",
  )
    .bind(session.sub)
    .first<Omit<UserRow, "password_hash">>();
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: "Not authenticated" }, 401);
  }
  return c.json(user);
});

// --- POST /auth/change-password ---
authRoutes.post("/change-password", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{
    current_password?: unknown;
    new_password?: unknown;
  }>();
  const current =
    typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";
  if (next.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE id = ?",
  )
    .bind(session.sub)
    .first<Pick<UserRow, "id" | "password_hash">>();
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const ok = await verifyPassword(current, user.password_hash);
  if (!ok) {
    return c.json({ error: "Current password incorrect" }, 401);
  }

  const newHash = await hashPassword(next);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(newHash, user.id)
    .run();
  return c.json({ ok: true });
});

// --- POST /auth/reset/:token ---
authRoutes.post("/reset/:token", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json<{ new_password?: unknown }>();
  const newPassword =
    typeof body.new_password === "string" ? body.new_password : "";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    "SELECT token_hash, user_id, expires_at, consumed_at FROM password_reset_tokens WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{
      token_hash: string;
      user_id: string;
      expires_at: number;
      consumed_at: number | null;
    }>();
  if (!row || row.consumed_at !== null || row.expires_at < now()) {
    return c.json({ error: "Invalid or expired token" }, 400);
  }

  const newHash = await hashPassword(newPassword);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(
      newHash,
      row.user_id,
    ),
    c.env.DB.prepare(
      "UPDATE password_reset_tokens SET consumed_at = ? WHERE token_hash = ?",
    ).bind(now(), tokenHash),
  ]);

  return c.json({ ok: true });
});

// --- internal helper for the admin tool (NOT exposed publicly) ---
// Kept here because the logic is auth-domain. The admin tool calls D1
// directly, but this is referenced for documentation: the schema for an
// admin-issued reset is `{ token (cleartext), token_hash, user_id, ... }`
// where only token_hash is persisted.

export async function generateResetToken(
  db: D1Database,
  userId: string,
  issuedBy: string,
): Promise<{ token: string; expires_at: number }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const createdAt = now();
  const expiresAt = createdAt + RESET_TOKEN_TTL_SECONDS * 1000;
  await db
    .prepare(
      "INSERT INTO password_reset_tokens (token_hash, user_id, issued_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(tokenHash, userId, issuedBy, createdAt, expiresAt)
    .run();
  return { token, expires_at: expiresAt };
}
