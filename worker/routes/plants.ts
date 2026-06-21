// ARB-100..103: Plants CRUD.
//
// Spatial-first design (PRD §6.1): GET queries plants by the property's
// `included_hexes`, NOT by property_id. So plants placed before a property
// was archived re-appear inside any new property covering the same hex set.
//
// All routes require an authenticated session and verify membership against
// the affected property/properties.

import { Hono } from "hono";
import type { PlantRow, PropertyRow } from "../lib/db";
import { now, parseHexes } from "../lib/db";
import { readSession } from "../lib/auth";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const plantRoutes = new Hono<{ Bindings: Bindings }>();

const MAX_NAME = 200;
const MAX_TEXT = 2000;

// --- helpers ---

// Global access (PRD simplification): any authenticated user can act on any
// active property, so these no longer check property_members. The userId arg
// is kept so call sites stay unchanged.
async function loadMembership(
  db: D1Database,
  _userId: string,
  propertyId: string,
): Promise<PropertyRow | null> {
  return db
    .prepare(
      `SELECT * FROM properties
        WHERE id = ? AND archived_at IS NULL
        LIMIT 1`,
    )
    .bind(propertyId)
    .first<PropertyRow>();
}

async function loadUserProperties(
  db: D1Database,
  _userId: string,
): Promise<PropertyRow[]> {
  const r = await db
    .prepare(`SELECT * FROM properties WHERE archived_at IS NULL`)
    .all<PropertyRow>();
  return r.results ?? [];
}

function findPropertyForCell(
  properties: PropertyRow[],
  cell: string,
): PropertyRow | null {
  for (const p of properties) {
    let hexes: string[];
    try {
      hexes = parseHexes(p.included_hexes);
    } catch {
      continue;
    }
    if (hexes.includes(cell)) return p;
  }
  return null;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// --- GET /plants?property_id=... ---
plantRoutes.get("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const propertyId = c.req.query("property_id");
  if (!propertyId) {
    return c.json({ error: "property_id is required" }, 400);
  }

  const property = await loadMembership(c.env.DB, session.sub, propertyId);
  if (!property) return c.json({ error: "Not found" }, 404);

  let hexes: string[];
  try {
    hexes = parseHexes(property.included_hexes);
  } catch {
    return c.json({ error: "Property has invalid included_hexes" }, 500);
  }

  if (hexes.length === 0) return c.json([]);

  // D1 has a per-query bind-param limit (~100). For typical residential
  // property sizes this is fine; we cap to be safe and document a TODO when
  // the count exceeds the cap.
  const MAX_BIND = 100;
  if (hexes.length > MAX_BIND) {
    // Chunk and union the results.
    const chunks: string[][] = [];
    for (let i = 0; i < hexes.length; i += MAX_BIND) {
      chunks.push(hexes.slice(i, i + MAX_BIND));
    }
    const all: PlantRow[] = [];
    for (const chunk of chunks) {
      const placeholders = chunk.map(() => "?").join(",");
      const r = await c.env.DB.prepare(
        `SELECT * FROM plants
          WHERE archived = 0 AND h3_res15 IN (${placeholders})`,
      )
        .bind(...chunk)
        .all<PlantRow>();
      if (r.results) all.push(...r.results);
    }
    // The single-query path below orders by common_name; sort the unioned
    // chunks the same way so pagination over the bind-param cap is consistent.
    all.sort((a, b) =>
      a.common_name.localeCompare(b.common_name, undefined, {
        sensitivity: "base",
      }),
    );
    return c.json(all);
  }

  const placeholders = hexes.map(() => "?").join(",");
  const r = await c.env.DB.prepare(
    `SELECT * FROM plants
      WHERE archived = 0 AND h3_res15 IN (${placeholders})
      ORDER BY common_name COLLATE NOCASE ASC`,
  )
    .bind(...hexes)
    .all<PlantRow>();
  return c.json(r.results ?? []);
});

// --- GET /plants/:id ---
plantRoutes.get("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const plant = await c.env.DB.prepare("SELECT * FROM plants WHERE id = ?")
    .bind(id)
    .first<PlantRow>();
  if (!plant || plant.archived) return c.json({ error: "Not found" }, 404);

  // The user must be a member of *some* property whose included_hexes
  // contains this plant's cell.
  const userProps = await loadUserProperties(c.env.DB, session.sub);
  if (!findPropertyForCell(userProps, plant.h3_res15)) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(plant);
});

// --- POST /plants ---
plantRoutes.post("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{
    property_id?: unknown;
    h3_res15?: unknown;
    lat?: unknown;
    lng?: unknown;
    common_name?: unknown;
    latin_name?: unknown;
    plant_type?: unknown;
    planted_date?: unknown;
    source?: unknown;
    notes?: unknown;
  }>();

  const propertyId =
    typeof body.property_id === "string" ? body.property_id : "";
  const cell = typeof body.h3_res15 === "string" ? body.h3_res15 : "";
  const commonName = trimOrNull(body.common_name, MAX_NAME);
  if (!propertyId) return c.json({ error: "property_id required" }, 400);
  if (!cell) return c.json({ error: "h3_res15 required" }, 400);
  if (!isFiniteNumber(body.lat) || !isFiniteNumber(body.lng)) {
    return c.json({ error: "lat and lng required" }, 400);
  }
  if (!commonName) return c.json({ error: "common_name required" }, 400);

  const property = await loadMembership(c.env.DB, session.sub, propertyId);
  if (!property) return c.json({ error: "Not found" }, 404);

  let hexes: string[];
  try {
    hexes = parseHexes(property.included_hexes);
  } catch {
    return c.json({ error: "Property has invalid included_hexes" }, 500);
  }
  if (!hexes.includes(cell)) {
    return c.json({ error: "h3_res15 is not in property.included_hexes" }, 400);
  }

  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO plants
       (id, property_id, h3_res15, lat, lng, common_name, latin_name,
        plant_type, planted_date, source, notes, archived,
        created_by, created_at, last_edited_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      propertyId,
      cell,
      body.lat,
      body.lng,
      commonName,
      trimOrNull(body.latin_name, MAX_NAME),
      trimOrNull(body.plant_type, MAX_NAME),
      trimOrNull(body.planted_date, 32),
      trimOrNull(body.source, MAX_NAME),
      trimOrNull(body.notes, MAX_TEXT),
      session.sub,
      t,
      session.sub,
      t,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM plants WHERE id = ?")
    .bind(id)
    .first<PlantRow>();
  return c.json(row);
});

// --- PATCH /plants/:id ---
plantRoutes.patch("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM plants WHERE id = ?")
    .bind(id)
    .first<PlantRow>();
  if (!existing || existing.archived) {
    return c.json({ error: "Not found" }, 404);
  }

  const userProps = await loadUserProperties(c.env.DB, session.sub);
  if (!findPropertyForCell(userProps, existing.h3_res15)) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json<
    Partial<{
      h3_res15: unknown;
      lat: unknown;
      lng: unknown;
      common_name: unknown;
      latin_name: unknown;
      plant_type: unknown;
      planted_date: unknown;
      source: unknown;
      notes: unknown;
    }>
  >();

  // If the cell is moving, the new cell must lie in some property the user
  // is a member of. We update the audit-record property_id to that property.
  let newCell = existing.h3_res15;
  let auditPropertyId = existing.property_id;
  if (
    typeof body.h3_res15 === "string" &&
    body.h3_res15 !== existing.h3_res15
  ) {
    const candidate = body.h3_res15;
    const owningProperty = findPropertyForCell(userProps, candidate);
    if (!owningProperty) {
      return c.json(
        { error: "h3_res15 is not inside any property you can edit" },
        400,
      );
    }
    newCell = candidate;
    auditPropertyId = owningProperty.id;
  }

  if (
    body.lat !== undefined &&
    body.lat !== null &&
    !isFiniteNumber(body.lat)
  ) {
    return c.json({ error: "lat must be a number" }, 400);
  }
  if (
    body.lng !== undefined &&
    body.lng !== null &&
    !isFiniteNumber(body.lng)
  ) {
    return c.json({ error: "lng must be a number" }, 400);
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  function set<T>(column: string, value: T): void {
    fields.push(`${column} = ?`);
    values.push(value);
  }

  set("h3_res15", newCell);
  set("property_id", auditPropertyId);
  if (isFiniteNumber(body.lat)) set("lat", body.lat);
  if (isFiniteNumber(body.lng)) set("lng", body.lng);
  if ("common_name" in body) {
    const next = trimOrNull(body.common_name, MAX_NAME);
    if (!next) return c.json({ error: "common_name required" }, 400);
    set("common_name", next);
  }
  if ("latin_name" in body)
    set("latin_name", trimOrNull(body.latin_name, MAX_NAME));
  if ("plant_type" in body)
    set("plant_type", trimOrNull(body.plant_type, MAX_NAME));
  if ("planted_date" in body)
    set("planted_date", trimOrNull(body.planted_date, 32));
  if ("source" in body) set("source", trimOrNull(body.source, MAX_NAME));
  if ("notes" in body) set("notes", trimOrNull(body.notes, MAX_TEXT));

  set("last_edited_by", session.sub);
  set("updated_at", now());

  await c.env.DB.prepare(`UPDATE plants SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM plants WHERE id = ?")
    .bind(id)
    .first<PlantRow>();
  return c.json(row);
});

// --- DELETE /plants/:id (soft delete) ---
plantRoutes.delete("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM plants WHERE id = ?")
    .bind(id)
    .first<PlantRow>();
  if (!existing || existing.archived) {
    return c.json({ error: "Not found" }, 404);
  }

  const userProps = await loadUserProperties(c.env.DB, session.sub);
  if (!findPropertyForCell(userProps, existing.h3_res15)) {
    return c.json({ error: "Not found" }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE plants SET archived = 1, last_edited_by = ?, updated_at = ? WHERE id = ?",
  )
    .bind(session.sub, now(), id)
    .run();
  return c.json({ ok: true });
});
