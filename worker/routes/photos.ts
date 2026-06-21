// ARB-121..123 + 127: Photos.
//
// Local-first compromise: instead of returning a signed R2 PUT URL (which
// `wrangler dev`'s simulated R2 doesn't model the same way as production),
// we accept a multipart/form-data POST and write to R2 inside the Worker.
// When the project moves to production R2 the upload route can swap to
// signed URLs without touching the SPA's higher-level photo lib.
//
// Endpoints:
//   POST   /photos           — multipart upload + metadata, returns row
//   GET    /photos/:id       — auth-checked, streams bytes from R2
//   GET    /photos?plant_id= — list photos for a plant (timeline)
//   PATCH  /photos/:id       — recaption
//   DELETE /photos/:id       — hard delete (row + R2 object)

import { Hono } from "hono";
import type { PhotoRow, PlantRow, PropertyRow } from "../lib/db";
import { now, parseHexes } from "../lib/db";
import { readSession } from "../lib/auth";

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  JWT_SECRET: string;
  /** Total R2 storage budget in bytes (overrides the default). */
  MAX_PHOTO_BYTES?: string;
};

export const photoRoutes = new Hono<{ Bindings: Bindings }>();

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB; the SPA resizes to ≤2048 px so well under this.
// Cost guardrail: refuse uploads once total stored bytes would cross this, so
// we never exceed R2's 10 GB free tier. Override with MAX_PHOTO_BYTES.
const DEFAULT_MAX_TOTAL_BYTES = 9_000_000_000; // ~9 GB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

// Global access (PRD simplification): any authenticated user can act on any
// active property, so this no longer checks property_members. The userId arg
// is kept so call sites stay unchanged.
async function loadUserProperties(
  db: D1Database,
  _userId: string,
): Promise<PropertyRow[]> {
  const r = await db
    .prepare(`SELECT * FROM properties WHERE archived_at IS NULL`)
    .all<PropertyRow>();
  return r.results ?? [];
}

function userOwnsCell(properties: PropertyRow[], cell: string): boolean {
  for (const p of properties) {
    try {
      if (parseHexes(p.included_hexes).includes(cell)) return true;
    } catch {
      // skip malformed
    }
  }
  return false;
}

async function userCanAccessPhoto(
  db: D1Database,
  userId: string,
  photo: PhotoRow,
): Promise<boolean> {
  const userProps = await loadUserProperties(db, userId);
  if (photo.plant_id) {
    const plant = await db
      .prepare("SELECT h3_res15 FROM plants WHERE id = ?")
      .bind(photo.plant_id)
      .first<{ h3_res15: string }>();
    if (!plant) return false;
    return userOwnsCell(userProps, plant.h3_res15);
  }
  if (photo.cell_h3_res15) {
    return userOwnsCell(userProps, photo.cell_h3_res15);
  }
  return false;
}

// --- POST /photos ---
photoRoutes.post("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "multipart/form-data required" }, 400);
  }

  // Workers' FormData.get returns `string | File | null`; we use a structural
  // check rather than `instanceof File` because the workers-types `File`
  // isn't always recognised as a constructor at the call site.
  const fileCandidate = form.get("file");
  if (
    fileCandidate === null ||
    typeof fileCandidate === "string" ||
    typeof (fileCandidate as { arrayBuffer?: unknown }).arrayBuffer !==
      "function"
  ) {
    return c.json({ error: "file field required" }, 400);
  }
  const file = fileCandidate as unknown as File;
  if (file.size === 0) return c.json({ error: "Empty file" }, 400);
  if (file.size > MAX_BYTES) {
    return c.json(
      { error: `File too large (${file.size} bytes; max ${MAX_BYTES})` },
      413,
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return c.json({ error: `Unsupported MIME type: ${file.type}` }, 415);
  }

  const plantIdRaw = form.get("plant_id");
  const cellPropertyIdRaw = form.get("cell_property_id");
  const cellHexRaw = form.get("cell_h3_res15");
  const captionRaw = form.get("caption");
  const takenAtRaw = form.get("taken_at");

  const plantId = typeof plantIdRaw === "string" ? plantIdRaw : null;
  const cellPropertyId =
    typeof cellPropertyIdRaw === "string" ? cellPropertyIdRaw : null;
  const cellHex = typeof cellHexRaw === "string" ? cellHexRaw : null;
  const caption =
    typeof captionRaw === "string" ? captionRaw.slice(0, 1000) : null;
  const takenAt =
    typeof takenAtRaw === "string" && /^\d+$/.test(takenAtRaw)
      ? Number(takenAtRaw)
      : null;

  // Exactly one of plant or cell.
  const hasPlant = !!plantId;
  const hasCell = !!cellPropertyId && !!cellHex;
  if (hasPlant === hasCell) {
    return c.json(
      {
        error: "Provide either plant_id OR (cell_property_id + cell_h3_res15)",
      },
      400,
    );
  }

  const userProps = await loadUserProperties(c.env.DB, session.sub);

  // Membership / cell-ownership check.
  if (hasPlant) {
    const plant = await c.env.DB.prepare(
      "SELECT * FROM plants WHERE id = ? AND archived = 0",
    )
      .bind(plantId)
      .first<PlantRow>();
    if (!plant) return c.json({ error: "Plant not found" }, 404);
    if (!userOwnsCell(userProps, plant.h3_res15)) {
      return c.json({ error: "Plant not found" }, 404);
    }
  } else {
    const owns = userProps.some((p) => p.id === cellPropertyId);
    if (!owns) return c.json({ error: "Property not found" }, 404);
    if (!userOwnsCell(userProps, cellHex!)) {
      return c.json({ error: "Cell not in property" }, 400);
    }
  }

  // Cost guardrail: never let total R2 usage cross the free-tier budget.
  const maxTotal = Number(c.env.MAX_PHOTO_BYTES) || DEFAULT_MAX_TOTAL_BYTES;
  const usage = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(bytes), 0) AS total FROM photos",
  ).first<{ total: number }>();
  if ((usage?.total ?? 0) + file.size > maxTotal) {
    return c.json(
      { error: "Photo storage is full. Delete some photos to free space." },
      507,
    );
  }

  const id = crypto.randomUUID();
  const ext = mimeToExt(file.type);
  const r2Key = hasPlant
    ? `plants/${plantId}/${id}.${ext}`
    : `cells/${cellPropertyId}/${cellHex}/${id}.${ext}`;

  const buf = await file.arrayBuffer();
  await c.env.PHOTOS.put(r2Key, buf, {
    httpMetadata: { contentType: file.type },
  });

  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO photos
       (id, plant_id, cell_property_id, cell_h3_res15, r2_key, caption, taken_at, uploaded_at, uploaded_by, bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      hasPlant ? plantId : null,
      hasPlant ? null : cellPropertyId,
      hasPlant ? null : cellHex,
      r2Key,
      caption,
      takenAt,
      t,
      session.sub,
      file.size,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM photos WHERE id = ?")
    .bind(id)
    .first<PhotoRow>();
  return c.json(row);
});

// --- GET /photos?plant_id=... or ?cell_property_id=...&cell_h3_res15=... ---
photoRoutes.get("/", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const plantId = c.req.query("plant_id");
  const cellPropertyId = c.req.query("cell_property_id");
  const cellHex = c.req.query("cell_h3_res15");

  if (plantId) {
    const plant = await c.env.DB.prepare(
      "SELECT h3_res15 FROM plants WHERE id = ?",
    )
      .bind(plantId)
      .first<{ h3_res15: string }>();
    if (!plant) return c.json([]);
    const userProps = await loadUserProperties(c.env.DB, session.sub);
    if (!userOwnsCell(userProps, plant.h3_res15)) return c.json([]);
    const r = await c.env.DB.prepare(
      "SELECT * FROM photos WHERE plant_id = ? ORDER BY COALESCE(taken_at, uploaded_at) ASC",
    )
      .bind(plantId)
      .all<PhotoRow>();
    return c.json(r.results ?? []);
  }

  if (cellPropertyId && cellHex) {
    const userProps = await loadUserProperties(c.env.DB, session.sub);
    if (!userProps.some((p) => p.id === cellPropertyId)) return c.json([]);
    if (!userOwnsCell(userProps, cellHex)) return c.json([]);
    const r = await c.env.DB.prepare(
      "SELECT * FROM photos WHERE cell_property_id = ? AND cell_h3_res15 = ? ORDER BY COALESCE(taken_at, uploaded_at) ASC",
    )
      .bind(cellPropertyId, cellHex)
      .all<PhotoRow>();
    return c.json(r.results ?? []);
  }

  return c.json(
    { error: "plant_id or (cell_property_id + cell_h3_res15) required" },
    400,
  );
});

// --- GET /photos/:id (binary) ---
photoRoutes.get("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const photo = await c.env.DB.prepare("SELECT * FROM photos WHERE id = ?")
    .bind(id)
    .first<PhotoRow>();
  if (!photo) return c.json({ error: "Not found" }, 404);

  if (!(await userCanAccessPhoto(c.env.DB, session.sub, photo))) {
    return c.json({ error: "Not found" }, 404);
  }

  const obj = await c.env.PHOTOS.get(photo.r2_key);
  if (!obj) return c.json({ error: "Not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type":
        obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
});

// --- PATCH /photos/:id (caption) ---
photoRoutes.patch("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const photo = await c.env.DB.prepare("SELECT * FROM photos WHERE id = ?")
    .bind(id)
    .first<PhotoRow>();
  if (!photo || !(await userCanAccessPhoto(c.env.DB, session.sub, photo))) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json<{ caption?: unknown }>();
  if (!("caption" in body)) {
    return c.json({ error: "caption field required" }, 400);
  }
  const caption =
    typeof body.caption === "string" ? body.caption.slice(0, 1000) : null;

  await c.env.DB.prepare("UPDATE photos SET caption = ? WHERE id = ?")
    .bind(caption, id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM photos WHERE id = ?")
    .bind(id)
    .first<PhotoRow>();
  return c.json(row);
});

// --- DELETE /photos/:id ---
photoRoutes.delete("/:id", async (c) => {
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const photo = await c.env.DB.prepare("SELECT * FROM photos WHERE id = ?")
    .bind(id)
    .first<PhotoRow>();
  if (!photo || !(await userCanAccessPhoto(c.env.DB, session.sub, photo))) {
    return c.json({ error: "Not found" }, 404);
  }

  await c.env.PHOTOS.delete(photo.r2_key);
  await c.env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
