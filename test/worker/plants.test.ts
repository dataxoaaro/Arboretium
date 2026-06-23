import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  getRequest,
  jsonRequest,
  seedUser,
  seedProperty,
  seedPlant,
  sessionCookie,
  seedUserWithProperty,
} from "./helpers";
import type { PlantRow } from "../../worker/lib/db";

describe("GET /plants", () => {
  it("requires authentication", async () => {
    expect((await getRequest("/plants?property_id=x")).status).toBe(401);
  });

  it("requires a property_id", async () => {
    const { cookie } = await seedUserWithProperty();
    expect((await getRequest("/plants", cookie)).status).toBe(400);
  });

  it("serves any active property's plants to any authenticated user", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { hexes: ["cell-a"] });
    const other = await sessionCookie((await seedUser()).id);
    const res = await getRequest(`/plants?property_id=${prop.id}`, other);
    expect(res.status).toBe(200);
  });

  it("returns only non-archived plants whose cell is in included_hexes, sorted", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a", "cell-b"],
    });
    await seedPlant(property.id, "cell-a", { common_name: "Zebra grass" });
    await seedPlant(property.id, "cell-b", { common_name: "Apple" });
    await seedPlant(property.id, "cell-a", {
      common_name: "Deleted",
      archived: true,
    });
    // A plant outside the property's hexes must not appear.
    await seedPlant(property.id, "cell-OUTSIDE", { common_name: "Stranger" });

    const res = await getRequest(`/plants?property_id=${property.id}`, cookie);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as PlantRow[];
    expect(rows.map((r) => r.common_name)).toEqual(["Apple", "Zebra grass"]);
  });

  it("resurfaces plants by hex regardless of their original property_id (spatial-first)", async () => {
    // A plant created under property A (the user is NOT a member of A) at cell-X.
    const stranger = await seedUser();
    const propA = await seedProperty(stranger.id, { hexes: ["cell-x"] });
    await seedPlant(propA.id, "cell-x", { common_name: "Heritage Oak" });

    // The user is a member of property B which covers cell-x.
    const user = await seedUser();
    const propB = await seedProperty(user.id, { hexes: ["cell-x"] });

    const res = await getRequest(
      `/plants?property_id=${propB.id}`,
      await sessionCookie(user.id),
    );
    const rows = (await res.json()) as PlantRow[];
    expect(rows.map((r) => r.common_name)).toEqual(["Heritage Oak"]);
  });

  it("returns results sorted even when hexes exceed the bind-param chunk size", async () => {
    const hexes = Array.from({ length: 150 }, (_, i) => `cell-${i}`);
    const { property, cookie } = await seedUserWithProperty({ hexes });
    // Insert in deliberately non-alphabetical order, spanning both chunks
    // (chunk boundary at 100).
    await seedPlant(property.id, "cell-10", { common_name: "Zinnia" });
    await seedPlant(property.id, "cell-140", { common_name: "Aster" });
    await seedPlant(property.id, "cell-75", { common_name: "Marigold" });

    const rows = (await (
      await getRequest(`/plants?property_id=${property.id}`, cookie)
    ).json()) as PlantRow[];
    expect(rows.map((r) => r.common_name)).toEqual([
      "Aster",
      "Marigold",
      "Zinnia",
    ]);
  });
});

describe("GET /plants/:id", () => {
  it("returns a plant when the user owns its cell", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await getRequest(`/plants/${id}`, cookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as PlantRow).toMatchObject({ id });
  });

  it("serves a plant to any authenticated user (global access)", async () => {
    const { property } = await seedUserWithProperty({ hexes: ["cell-a"] });
    const { id } = await seedPlant(property.id, "cell-a");
    const outsider = await sessionCookie((await seedUser()).id);
    expect((await getRequest(`/plants/${id}`, outsider)).status).toBe(200);
  });

  it("404s for an archived plant", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a", { archived: true });
    expect((await getRequest(`/plants/${id}`, cookie)).status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await getRequest("/plants/some-id")).status).toBe(401);
  });
});

describe("POST /plants", () => {
  it("creates a plant in a cell within the property", async () => {
    const { user, property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const res = await jsonRequest(
      "/plants",
      "POST",
      {
        property_id: property.id,
        h3_res15: "cell-a",
        lat: 60.1,
        lng: 24.9,
        common_name: "Birch",
      },
      { cookie },
    );
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlantRow;
    expect(row.common_name).toBe("Birch");
    expect(row.created_by).toBe(user.id);
    expect(row.last_edited_by).toBe(user.id);
    expect(row.archived).toBe(0);
    // Defaults when not supplied.
    expect(row.category).toBe("kasvi");
    expect(row.color).toBeNull();
  });

  it("stores a category and a colour override, normalising bad input", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const ok = (await (
      await jsonRequest(
        "/plants",
        "POST",
        {
          property_id: property.id,
          h3_res15: "cell-a",
          lat: 60.1,
          lng: 24.9,
          common_name: "Pönttö",
          category: "linnunpontto",
          color: "#2f6f9f",
        },
        { cookie },
      )
    ).json()) as PlantRow;
    expect(ok.category).toBe("linnunpontto");
    expect(ok.color).toBe("#2f6f9f");

    const bad = (await (
      await jsonRequest(
        "/plants",
        "POST",
        {
          property_id: property.id,
          h3_res15: "cell-a",
          lat: 60.1,
          lng: 24.9,
          common_name: "X",
          category: "bogus",
          color: "red",
        },
        { cookie },
      )
    ).json()) as PlantRow;
    expect(bad.category).toBe("kasvi");
    expect(bad.color).toBeNull();
  });

  it("rejects a cell not in the property's included_hexes", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const res = await jsonRequest(
      "/plants",
      "POST",
      {
        property_id: property.id,
        h3_res15: "cell-elsewhere",
        lat: 1,
        lng: 2,
        common_name: "Rogue",
      },
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("lets any authenticated user create a plant in any active property", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { hexes: ["cell-a"] });
    const res = await jsonRequest(
      "/plants",
      "POST",
      {
        property_id: prop.id,
        h3_res15: "cell-a",
        lat: 1,
        lng: 2,
        common_name: "X",
      },
      { cookie: await sessionCookie((await seedUser()).id) },
    );
    expect(res.status).toBe(200);
  });

  it("validates required fields", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const base = {
      property_id: property.id,
      h3_res15: "cell-a",
      lat: 1,
      lng: 2,
      common_name: "Ok",
    };
    for (const missing of ["property_id", "h3_res15", "common_name"] as const) {
      const body = { ...base, [missing]: "" };
      expect(
        (await jsonRequest("/plants", "POST", body, { cookie })).status,
      ).toBe(400);
    }
    const noCoords = { ...base, lat: "x", lng: "y" };
    expect(
      (await jsonRequest("/plants", "POST", noCoords, { cookie })).status,
    ).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await jsonRequest("/plants", "POST", {});
    expect(res.status).toBe(401);
  });
});

describe("PATCH /plants/:id", () => {
  it("updates editable fields", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a", {
      common_name: "Old",
    });
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { common_name: "New", notes: "a note" },
      { cookie },
    );
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlantRow;
    expect(row.common_name).toBe("New");
    expect(row.notes).toBe("a note");
  });

  it("allows moving to a cell within one of the user's properties", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a", "cell-b"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { h3_res15: "cell-b" },
      { cookie },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as PlantRow).h3_res15).toBe("cell-b");
  });

  it("rejects moving to a cell outside the user's properties", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { h3_res15: "cell-far-away" },
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("rejects clearing common_name", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { common_name: "  " },
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric lat or lng", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    expect(
      (await jsonRequest(`/plants/${id}`, "PATCH", { lat: "x" }, { cookie }))
        .status,
    ).toBe(400);
    expect(
      (await jsonRequest(`/plants/${id}`, "PATCH", { lng: "y" }, { cookie }))
        .status,
    ).toBe(400);
  });

  it("updates lat/lng when valid numbers are provided", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { lat: 61.5, lng: 25.5 },
      { cookie },
    );
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlantRow;
    expect(row.lat).toBe(61.5);
    expect(row.lng).toBe(25.5);
  });

  it("lets any authenticated user edit a plant (global access)", async () => {
    const { property } = await seedUserWithProperty({ hexes: ["cell-a"] });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "PATCH",
      { common_name: "Shared edit" },
      { cookie: await sessionCookie((await seedUser()).id) },
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /plants/:id", () => {
  it("soft-deletes a plant", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(`/plants/${id}`, "DELETE", {}, { cookie });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT archived FROM plants WHERE id = ?")
      .bind(id)
      .first<{ archived: number }>();
    expect(row?.archived).toBe(1);
  });

  it("404s on an already-archived plant", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a", { archived: true });
    expect(
      (await jsonRequest(`/plants/${id}`, "DELETE", {}, { cookie })).status,
    ).toBe(404);
  });

  it("lets any authenticated user delete a plant (global access)", async () => {
    const { property } = await seedUserWithProperty({ hexes: ["cell-a"] });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await jsonRequest(
      `/plants/${id}`,
      "DELETE",
      {},
      { cookie: await sessionCookie((await seedUser()).id) },
    );
    expect(res.status).toBe(200);
  });

  it("requires authentication", async () => {
    expect((await jsonRequest("/plants/x", "DELETE", {})).status).toBe(401);
  });
});
