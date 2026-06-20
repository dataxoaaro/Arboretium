// ARB-140..145: Cell (hex) notes + cell detail.
//
// A "cell" row carries free-text notes about a hex location itself (soil,
// shade, "before planting" shots live as cell photos). Create-on-write: a row
// only exists once a note is set. Lookups are spatial-first (PRD §6.1):
//
//   GET  /cells?property_id=…        — annotated cells (notes or photos) in a
//                                       property, for the map overlay
//   GET  /cells/:propertyId/:h3      — one cell: notes + plants + cell photos
//   PUT  /cells/:propertyId/:h3      — upsert the cell's notes (create-on-write)
//
// All routes require an authenticated session and verify the user is a member
// of the property and that the hex lies in its included_hexes.

import { Hono } from "hono";
import type { CellRow, PhotoRow, PlantRow, PropertyRow } from "../lib/db";
import { now, parseHexes } from "../lib/db";
import { readSession } from "../lib/auth";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const cellRoutes = new Hono<{ Bindings: Bindings }>();

const MAX_NOTES = 2000;
const MAX_BIND = 100;

async function loadMembership(
  db: D1Database,
  userId: string,
  propertyId: string,
): Promise<PropertyRow | null> {
  return db
    .prepare(
      `SELECT p.* FROM properties p
         JOIN property_members m ON m.property_id = p.id
        WHERE p.id = ? AND m.user_id = ? AND p.archived_at IS NULL
        LIMIT 1`,
    )
    .bind(propertyId, userId)
    .first<PropertyRow>();
}

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Count cell photos per hex for a set of hexes (chunked for the bind cap). */
async function photoCountsByHex(
  db: D1Database,
  hexes: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < hexes.length; i += MAX_BIND) {
    const chunk = hexes.slice(i, i + MAX_BIND);
    const placeholders = chunk.map(() => "?").join(",");
    const r = await db
      .prepare(
        `SELECT cell_h3_res15 AS h3, COUNT(*) AS n
           FROM photos
          WHERE cell_h3_res15 IN (${placeholders})
          GROUP BY cell_h3_res15`,
      )
      .bind(...chunk)
      .all<{ h3: string; n: number }>();
    for (const row of r.results ?? []) counts.set(row.h3, row.n);
  }
  return counts;
}

// --- GET /cells?property_id=... — annotated cells for the map overlay ---
cellRoutes.get("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const propertyId = c.req.query("property_id");
  if (!propertyId) return c.json({ error: "property_id is required" }, 400);

  const property = await loadMembership(c.env.DB, session.sub, propertyId);
  if (!property) return c.json({ error: "Not found" }, 404);

  let hexes: string[];
  try {
    hexes = parseHexes(property.included_hexes);
  } catch {
    return c.json({ error: "Property has invalid included_hexes" }, 500);
  }
  if (hexes.length === 0) return c.json([]);

  const noteRows = await c.env.DB.prepare(
    `SELECT h3_res15, notes FROM cells
      WHERE property_id = ? AND notes IS NOT NULL AND TRIM(notes) != ''`,
  )
    .bind(propertyId)
    .all<{ h3_res15: string; notes: string }>();

  const photoCounts = await photoCountsByHex(c.env.DB, hexes);
  const hexSet = new Set(hexes);

  const byHex = new Map<
    string,
    { notes: string | null; photo_count: number }
  >();
  for (const row of noteRows.results ?? []) {
    if (!hexSet.has(row.h3_res15)) continue;
    byHex.set(row.h3_res15, { notes: row.notes, photo_count: 0 });
  }
  for (const [h3, n] of photoCounts) {
    const existing = byHex.get(h3);
    if (existing) existing.photo_count = n;
    else byHex.set(h3, { notes: null, photo_count: n });
  }

  return c.json(
    [...byHex.entries()].map(([h3_res15, v]) => ({
      h3_res15,
      notes: v.notes,
      photo_count: v.photo_count,
    })),
  );
});

// --- GET /cells/:propertyId/:h3 — full cell detail ---
cellRoutes.get("/:propertyId/:h3", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const propertyId = c.req.param("propertyId");
  const h3 = c.req.param("h3");

  const property = await loadMembership(c.env.DB, session.sub, propertyId);
  if (!property) return c.json({ error: "Not found" }, 404);

  let hexes: string[];
  try {
    hexes = parseHexes(property.included_hexes);
  } catch {
    return c.json({ error: "Property has invalid included_hexes" }, 500);
  }
  if (!hexes.includes(h3)) return c.json({ error: "Not found" }, 404);

  const cell = await c.env.DB.prepare(
    "SELECT * FROM cells WHERE property_id = ? AND h3_res15 = ?",
  )
    .bind(propertyId, h3)
    .first<CellRow>();

  // Spatial-first: plants and cell photos are anchored to the hex, not the
  // property, so archived-property data resurfaces here too.
  const plants = await c.env.DB.prepare(
    "SELECT * FROM plants WHERE h3_res15 = ? AND archived = 0 ORDER BY common_name COLLATE NOCASE ASC",
  )
    .bind(h3)
    .all<PlantRow>();
  const photos = await c.env.DB.prepare(
    "SELECT * FROM photos WHERE cell_h3_res15 = ? ORDER BY COALESCE(taken_at, uploaded_at) ASC",
  )
    .bind(h3)
    .all<PhotoRow>();

  return c.json({
    property_id: propertyId,
    h3_res15: h3,
    notes: cell?.notes ?? null,
    plants: plants.results ?? [],
    photos: photos.results ?? [],
  });
});

// --- PUT /cells/:propertyId/:h3 — upsert notes (create-on-write) ---
cellRoutes.put("/:propertyId/:h3", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const propertyId = c.req.param("propertyId");
  const h3 = c.req.param("h3");

  const property = await loadMembership(c.env.DB, session.sub, propertyId);
  if (!property) return c.json({ error: "Not found" }, 404);

  let hexes: string[];
  try {
    hexes = parseHexes(property.included_hexes);
  } catch {
    return c.json({ error: "Property has invalid included_hexes" }, 500);
  }
  if (!hexes.includes(h3)) {
    return c.json({ error: "h3 is not in property.included_hexes" }, 400);
  }

  const body = await c.req.json<{ notes?: unknown }>();
  const notes = trimOrNull(body.notes, MAX_NOTES);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO cells (property_id, h3_res15, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(property_id, h3_res15)
       DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`,
  )
    .bind(propertyId, h3, notes, t, t)
    .run();

  const row = await c.env.DB.prepare(
    "SELECT * FROM cells WHERE property_id = ? AND h3_res15 = ?",
  )
    .bind(propertyId, h3)
    .first<CellRow>();
  return c.json(row);
});
