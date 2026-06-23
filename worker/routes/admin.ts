// ARB-E3 backend: admin endpoints. Gated by an authenticated session — any
// registered user may manage properties (and users/backups) in production.
// Registration itself is gated by SITE_PASSWORD, so "any registered user" is a
// trusted group. Property access is platform-wide (no per-property
// owner/membership), so these endpoints intentionally have no per-user scoping.

import { Hono } from "hono";
import type { UserRow, PropertyRow, PlantRow } from "../lib/db";
import { now } from "../lib/db";
import { readSession } from "../lib/auth";
import { generateResetToken } from "./auth";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

// Gate: every endpoint below requires a signed-in user (401 otherwise).
adminRoutes.use("*", async (c, next) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);
  await next();
});

// --- properties ---

adminRoutes.get("/properties", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT * FROM properties ORDER BY created_at DESC",
  ).all<PropertyRow>();
  return c.json(result.results);
});

adminRoutes.post("/properties", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<Partial<PropertyRow>>();
  const name = body.name;
  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  // No owner concept anymore. owner_id is kept only because the column is NOT
  // NULL; it records the creator but grants no special access.
  const creatorId = session.sub;
  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO properties
       (id, owner_id, name, boundary_geojson, included_hexes, center_lat, center_lng, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      id,
      creatorId,
      name,
      body.boundary_geojson ?? null,
      body.included_hexes ?? "[]",
      body.center_lat ?? null,
      body.center_lng ?? null,
      t,
      t,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM properties WHERE id = ?")
    .bind(id)
    .first<PropertyRow>();
  return c.json(row);
});

adminRoutes.patch("/properties/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PropertyRow>>();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const k of [
    "name",
    "boundary_geojson",
    "included_hexes",
    "center_lat",
    "center_lng",
  ] as const) {
    if (k in body) {
      fields.push(`${k} = ?`);
      values.push(body[k] ?? null);
    }
  }
  if (fields.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);
  await c.env.DB.prepare(
    `UPDATE properties SET ${fields.join(", ")} WHERE id = ?`,
  )
    .bind(...values)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM properties WHERE id = ?")
    .bind(id)
    .first<PropertyRow>();
  return c.json(row);
});

adminRoutes.delete("/properties/:id", async (c) => {
  const id = c.req.param("id");
  const t = now();
  await c.env.DB.prepare(
    "UPDATE properties SET archived_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(t, t, id)
    .run();
  return c.json({ ok: true, archived_at: t });
});

adminRoutes.post("/properties/:id/restore", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE properties SET archived_at = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(now(), id)
    .run();
  return c.json({ ok: true });
});

// --- users ---

adminRoutes.get("/users", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT id, email, display_name, created_at
       FROM users ORDER BY created_at ASC`,
  ).all();
  return c.json(r.results);
});

adminRoutes.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/reset-link", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ issued_by?: string }>();
  if (!body.issued_by) return c.json({ error: "issued_by required" }, 400);
  const result = await generateResetToken(c.env.DB, id, body.issued_by);
  return c.json(result);
});

// --- diagnostics ---

adminRoutes.get("/stats", async (c) => {
  const counts = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users"),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM properties WHERE archived_at IS NULL",
    ),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM properties WHERE archived_at IS NOT NULL",
    ),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM plants WHERE archived = 0"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM photos"),
  ]);
  return c.json({
    users: (counts[0].results?.[0] as { n: number } | undefined)?.n ?? 0,
    properties_active:
      (counts[1].results?.[0] as { n: number } | undefined)?.n ?? 0,
    properties_archived:
      (counts[2].results?.[0] as { n: number } | undefined)?.n ?? 0,
    plants: (counts[3].results?.[0] as { n: number } | undefined)?.n ?? 0,
    photos: (counts[4].results?.[0] as { n: number } | undefined)?.n ?? 0,
  });
});

// --- archived items (restore) ---

// List soft-deleted plants/items so an admin can recover them.
adminRoutes.get("/plants/archived", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT * FROM plants WHERE archived = 1 ORDER BY updated_at DESC",
  ).all<PlantRow>();
  return c.json(r.results ?? []);
});

// Restore a soft-deleted plant/item (clears the archived flag).
adminRoutes.post("/plants/:id/restore", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE plants SET archived = 0, updated_at = ? WHERE id = ?",
  )
    .bind(now(), id)
    .run();
  return c.json({ ok: true });
});

// Reserved import for forward use without unused-import complaints.
export type _Reserved = UserRow;
