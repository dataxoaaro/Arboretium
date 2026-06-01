// ARB-E3 backend: admin endpoints, gated by the LOCAL_ADMIN env var.
// In production the var is never set, so every /admin/* call returns 404 —
// the deployed Worker has no admin surface. In local dev `.dev.vars` sets
// LOCAL_ADMIN=true so the local admin tool can manage properties + users.
//
// SECURITY: a future production-deployment workflow can either keep this
// file but never set LOCAL_ADMIN, or replace these routes with direct
// Cloudflare HTTP API calls from the admin tool. See PRD §8.9.

import { Hono } from "hono";
import type { UserRow, PropertyRow, PlantRow } from "../lib/db";
import { now } from "../lib/db";
import { generateResetToken } from "./auth";

type Bindings = {
  DB: D1Database;
  LOCAL_ADMIN?: string;
};

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

// Gate: every endpoint below 404s unless LOCAL_ADMIN === "true".
adminRoutes.use("*", async (c, next) => {
  if (c.env.LOCAL_ADMIN !== "true") {
    return c.json({ error: "Not found" }, 404);
  }
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
  const body = await c.req.json<Partial<PropertyRow>>();
  const ownerId = body.owner_id;
  const name = body.name;
  if (!ownerId || !name) {
    return c.json({ error: "owner_id and name are required" }, 400);
  }

  const owner = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(ownerId)
    .first<{ id: string }>();
  if (!owner) return c.json({ error: "owner_id does not exist" }, 400);

  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO properties
       (id, owner_id, name, boundary_geojson, included_hexes, center_lat, center_lng, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      name,
      body.boundary_geojson ?? null,
      body.included_hexes ?? "[]",
      body.center_lat ?? null,
      body.center_lng ?? null,
      t,
      t,
    )
    .run();

  await c.env.DB.prepare(
    "INSERT INTO property_members (property_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, ownerId, ownerId, t)
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
    "owner_id",
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

adminRoutes.get("/properties/:id/members", async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.created_at, m.added_at, m.added_by
     FROM property_members m JOIN users u ON u.id = m.user_id
     WHERE m.property_id = ?
     ORDER BY m.added_at ASC`,
  )
    .bind(id)
    .all();
  return c.json(r.results);
});

adminRoutes.post("/properties/:id/members", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ email?: string; added_by?: string }>();
  if (!body.email || !body.added_by) {
    return c.json({ error: "email and added_by required" }, 400);
  }
  const user = await c.env.DB.prepare(
    "SELECT id FROM users WHERE lower(email) = lower(?)",
  )
    .bind(body.email)
    .first<{ id: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  try {
    await c.env.DB.prepare(
      "INSERT INTO property_members (property_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)",
    )
      .bind(id, user.id, body.added_by, now())
      .run();
  } catch (err) {
    return c.json(
      { error: "Already a member or invalid", detail: String(err) },
      409,
    );
  }
  return c.json({ ok: true, user_id: user.id });
});

adminRoutes.delete("/properties/:id/members/:userId", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM property_members WHERE property_id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), c.req.param("userId"))
    .run();
  return c.json({ ok: true });
});

// --- users ---

adminRoutes.get("/users", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.created_at,
            (SELECT COUNT(*) FROM property_members WHERE user_id = u.id) AS membership_count
     FROM users u ORDER BY u.created_at ASC`,
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

// Reserved imports for forward use without unused-import complaints.
export type _Reserved = UserRow | PlantRow;
