// ARB-090: GET /properties — returns the active properties the signed-in
// user is a member of. Used by the property picker (ARB-091/094).
//
// Plant CRUD lives in a separate file under ARB-E6.

import { Hono } from "hono";
import type { PropertyRow } from "../lib/db";
import { readSession } from "../lib/auth";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const propertyRoutes = new Hono<{ Bindings: Bindings }>();

propertyRoutes.get("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const result = await c.env.DB.prepare(
    `SELECT p.*
       FROM properties p
       JOIN property_members m ON m.property_id = p.id
      WHERE m.user_id = ?
        AND p.archived_at IS NULL
      ORDER BY p.name COLLATE NOCASE ASC`,
  )
    .bind(session.sub)
    .all<PropertyRow>();
  return c.json(result.results);
});

// Single-property fetch — only succeeds if the user is a member.
propertyRoutes.get("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT p.*
       FROM properties p
       JOIN property_members m ON m.property_id = p.id
      WHERE p.id = ?
        AND m.user_id = ?
        AND p.archived_at IS NULL
      LIMIT 1`,
  )
    .bind(id, session.sub)
    .first<PropertyRow>();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});
