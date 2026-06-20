import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  getRequest,
  jsonRequest,
  seedUser,
  seedProperty,
  addMember,
  seedPlant,
  sessionCookie,
  seedMemberWithProperty,
} from "./helpers";
import type { CellRow } from "../../worker/lib/db";

interface CellDetail {
  h3_res15: string;
  notes: string | null;
  plants: { id: string; common_name: string }[];
  photos: { id: string }[];
}
interface CellSummary {
  h3_res15: string;
  notes: string | null;
  photo_count: number;
}

async function seedCellNote(
  propertyId: string,
  h3: string,
  notes: string,
): Promise<void> {
  const t = Date.now();
  await env.DB.prepare(
    "INSERT INTO cells (property_id, h3_res15, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(propertyId, h3, notes, t, t)
    .run();
}

async function seedCellPhoto(
  propertyId: string,
  h3: string,
  uploadedBy: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO photos (id, plant_id, cell_property_id, cell_h3_res15, r2_key, caption, taken_at, uploaded_at, uploaded_by)
     VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      propertyId,
      h3,
      `cells/${h3}/x.jpg`,
      Date.now(),
      uploadedBy,
    )
    .run();
}

describe("GET /cells", () => {
  it("requires authentication", async () => {
    expect((await getRequest("/cells?property_id=x")).status).toBe(401);
  });

  it("requires a property_id", async () => {
    const { cookie } = await seedMemberWithProperty();
    expect((await getRequest("/cells", cookie)).status).toBe(400);
  });

  it("404s for a non-member property", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { hexes: ["cell-a"] });
    await addMember(prop.id, owner.id);
    const other = await sessionCookie((await seedUser()).id);
    expect(
      (await getRequest(`/cells?property_id=${prop.id}`, other)).status,
    ).toBe(404);
  });

  it("returns annotated cells (notes and/or photos) within the property", async () => {
    const { user, property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a", "cell-b", "cell-c"],
    });
    await seedCellNote(property.id, "cell-a", "rocky soil");
    await seedCellPhoto(property.id, "cell-b", user.id);
    // cell-c has nothing → must not appear.
    // A note outside the property's hexes must not appear either.
    await seedCellNote(property.id, "cell-OUTSIDE", "stray");

    const res = await getRequest(`/cells?property_id=${property.id}`, cookie);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as CellSummary[];
    const byHex = Object.fromEntries(rows.map((r) => [r.h3_res15, r]));
    expect(Object.keys(byHex).sort()).toEqual(["cell-a", "cell-b"]);
    expect(byHex["cell-a"].notes).toBe("rocky soil");
    expect(byHex["cell-b"].photo_count).toBe(1);
  });

  it("returns an empty array when nothing is annotated", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    const rows = (await (
      await getRequest(`/cells?property_id=${property.id}`, cookie)
    ).json()) as CellSummary[];
    expect(rows).toEqual([]);
  });
});

describe("GET /cells/:propertyId/:h3", () => {
  it("returns notes, plants, and cell photos for a hex", async () => {
    const { user, property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    await seedCellNote(property.id, "cell-a", "heavy shade");
    await seedPlant(property.id, "cell-a", { common_name: "Fern" });
    await seedCellPhoto(property.id, "cell-a", user.id);

    const res = await getRequest(`/cells/${property.id}/cell-a`, cookie);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as CellDetail;
    expect(detail.notes).toBe("heavy shade");
    expect(detail.plants.map((p) => p.common_name)).toEqual(["Fern"]);
    expect(detail.photos).toHaveLength(1);
  });

  it("returns null notes and empty arrays for a bare cell", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    const detail = (await (
      await getRequest(`/cells/${property.id}/cell-a`, cookie)
    ).json()) as CellDetail;
    expect(detail.notes).toBeNull();
    expect(detail.plants).toEqual([]);
    expect(detail.photos).toEqual([]);
  });

  it("404s for a hex outside the property", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    expect(
      (await getRequest(`/cells/${property.id}/cell-elsewhere`, cookie)).status,
    ).toBe(404);
  });

  it("404s for a non-member", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { hexes: ["cell-a"] });
    await addMember(prop.id, owner.id);
    const other = await sessionCookie((await seedUser()).id);
    expect((await getRequest(`/cells/${prop.id}/cell-a`, other)).status).toBe(
      404,
    );
  });

  it("requires authentication", async () => {
    expect((await getRequest("/cells/p/cell-a")).status).toBe(401);
  });
});

describe("PUT /cells/:propertyId/:h3", () => {
  it("creates a note on write, then updates it", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    const create = await jsonRequest(
      `/cells/${property.id}/cell-a`,
      "PUT",
      { notes: "rocky" },
      { cookie },
    );
    expect(create.status).toBe(200);
    expect(((await create.json()) as CellRow).notes).toBe("rocky");

    const update = await jsonRequest(
      `/cells/${property.id}/cell-a`,
      "PUT",
      { notes: "sandy" },
      { cookie },
    );
    expect(((await update.json()) as CellRow).notes).toBe("sandy");

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cells WHERE property_id = ? AND h3_res15 = ?",
    )
      .bind(property.id, "cell-a")
      .first<{ n: number }>();
    expect(count?.n).toBe(1); // upsert, not duplicate
  });

  it("clears the note when given whitespace", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    await jsonRequest(
      `/cells/${property.id}/cell-a`,
      "PUT",
      { notes: "x" },
      { cookie },
    );
    const res = await jsonRequest(
      `/cells/${property.id}/cell-a`,
      "PUT",
      { notes: "   " },
      { cookie },
    );
    expect(((await res.json()) as CellRow).notes).toBeNull();
  });

  it("rejects a hex outside the property", async () => {
    const { property, cookie } = await seedMemberWithProperty({
      hexes: ["cell-a"],
    });
    const res = await jsonRequest(
      `/cells/${property.id}/cell-nope`,
      "PUT",
      { notes: "x" },
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("404s for a non-member", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { hexes: ["cell-a"] });
    await addMember(prop.id, owner.id);
    const res = await jsonRequest(
      `/cells/${prop.id}/cell-a`,
      "PUT",
      { notes: "x" },
      { cookie: await sessionCookie((await seedUser()).id) },
    );
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect(
      (await jsonRequest("/cells/p/cell-a", "PUT", { notes: "x" })).status,
    ).toBe(401);
  });
});
