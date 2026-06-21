// ARB-090: GET /properties — returns every active property to any signed-in
// user (platform-wide access; no per-property membership). Used by the
// property picker (ARB-091/094).
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
    `SELECT *
       FROM properties
      WHERE archived_at IS NULL
      ORDER BY name COLLATE NOCASE ASC`,
  ).all<PropertyRow>();
  return c.json(result.results);
});

// Single-property fetch — any authenticated user can read any active property.
propertyRoutes.get("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT *
       FROM properties
      WHERE id = ?
        AND archived_at IS NULL
      LIMIT 1`,
  )
    .bind(id)
    .first<PropertyRow>();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});
