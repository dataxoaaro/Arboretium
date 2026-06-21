import { describe, it, expect } from "vitest";
import {
  request,
  getRequest,
  jsonRequest,
  seedUser,
  seedPlant,
  sessionCookie,
  seedUserWithProperty,
} from "./helpers";
import type { PhotoRow } from "../../worker/lib/db";

const ORIGIN = "http://localhost:5173";

function imageFile(type = "image/jpeg", bytes = 32): File {
  return new File([new Uint8Array(bytes).fill(7)], "photo.jpg", { type });
}

function upload(
  fields: Record<string, string | File>,
  cookie?: string,
  envOverride?: Record<string, unknown>,
): Promise<Response> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (cookie) headers.Cookie = cookie;
  return request("/photos", { method: "POST", body: fd, headers }, envOverride);
}

describe("POST /photos", () => {
  it("requires authentication", async () => {
    expect((await upload({ file: imageFile() })).status).toBe(401);
  });

  it("requires a file field", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    expect((await upload({ plant_id: id }, cookie)).status).toBe(400);
  });

  it("rejects an unsupported mime type", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      { file: imageFile("text/plain"), plant_id: id },
      cookie,
    );
    expect(res.status).toBe(415);
  });

  it("rejects an empty file", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      { file: new File([], "empty.jpg", { type: "image/jpeg" }), plant_id: id },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("rejects providing both plant and cell targets", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      {
        file: imageFile(),
        plant_id: id,
        cell_property_id: property.id,
        cell_h3_res15: "cell-a",
      },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("rejects providing neither plant nor cell", async () => {
    const { cookie } = await seedUserWithProperty({ hexes: ["cell-a"] });
    expect((await upload({ file: imageFile() }, cookie)).status).toBe(400);
  });

  it("uploads a plant photo and serves it back", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      { file: imageFile(), plant_id: plantId, caption: "first" },
      cookie,
    );
    expect(res.status).toBe(200);
    const photo = (await res.json()) as PhotoRow;
    expect(photo.plant_id).toBe(plantId);
    expect(photo.caption).toBe("first");

    const bin = await getRequest(`/photos/${photo.id}`, cookie);
    expect(bin.status).toBe(200);
    expect(bin.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("uploads a cell photo when the cell is in the property", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const res = await upload(
      {
        file: imageFile(),
        cell_property_id: property.id,
        cell_h3_res15: "cell-a",
      },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as PhotoRow).cell_h3_res15).toBe("cell-a");
  });

  it("rejects a cell photo when the cell is not in the property", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const res = await upload(
      {
        file: imageFile(),
        cell_property_id: property.id,
        cell_h3_res15: "cell-not-here",
      },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("lets any authenticated user upload to a plant (global access)", async () => {
    const { property } = await seedUserWithProperty({ hexes: ["cell-a"] });
    const { id } = await seedPlant(property.id, "cell-a");
    const outsider = await sessionCookie((await seedUser()).id);
    const res = await upload({ file: imageFile(), plant_id: id }, outsider);
    expect(res.status).toBe(200);
  });

  it("records the stored byte size", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      { file: imageFile("image/jpeg", 64), plant_id: plantId },
      cookie,
    );
    expect(((await res.json()) as PhotoRow).bytes).toBe(64);
  });

  it("refuses uploads that would exceed the storage budget (507)", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const res = await upload(
      { file: imageFile("image/jpeg", 100), plant_id: plantId },
      cookie,
      { MAX_PHOTO_BYTES: "10" }, // 100-byte upload vs a 10-byte budget
    );
    expect(res.status).toBe(507);
  });
});

describe("GET /photos (timeline)", () => {
  it("lists a plant's photos ordered by taken_at", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    await upload(
      {
        file: imageFile(),
        plant_id: plantId,
        taken_at: "2000",
        caption: "late",
      },
      cookie,
    );
    await upload(
      {
        file: imageFile(),
        plant_id: plantId,
        taken_at: "1000",
        caption: "early",
      },
      cookie,
    );
    const res = await getRequest(`/photos?plant_id=${plantId}`, cookie);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as PhotoRow[];
    expect(rows.map((r) => r.caption)).toEqual(["early", "late"]);
  });

  it("requires authentication", async () => {
    expect((await getRequest("/photos?plant_id=x")).status).toBe(401);
  });
});

describe("GET /photos/:id", () => {
  it("serves a photo to any authenticated user (global access)", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload({ file: imageFile(), plant_id: plantId }, cookie)
    ).json()) as PhotoRow;
    const outsider = await sessionCookie((await seedUser()).id);
    expect((await getRequest(`/photos/${photo.id}`, outsider)).status).toBe(
      200,
    );
  });
});

describe("PATCH /photos/:id", () => {
  it("recaptions a photo", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload({ file: imageFile(), plant_id: plantId }, cookie)
    ).json()) as PhotoRow;
    const res = await jsonRequest(
      `/photos/${photo.id}`,
      "PATCH",
      { caption: "renamed" },
      { cookie },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as PhotoRow).caption).toBe("renamed");
  });

  it("requires a caption field", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload({ file: imageFile(), plant_id: plantId }, cookie)
    ).json()) as PhotoRow;
    const res = await jsonRequest(
      `/photos/${photo.id}`,
      "PATCH",
      {},
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("clears the caption when patched with a non-string value", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload(
        { file: imageFile(), plant_id: plantId, caption: "had one" },
        cookie,
      )
    ).json()) as PhotoRow;
    const res = await jsonRequest(
      `/photos/${photo.id}`,
      "PATCH",
      { caption: 123 },
      { cookie },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as PhotoRow).caption).toBeNull();
  });
});

describe("DELETE /photos/:id", () => {
  it("deletes the row and the stored object", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload({ file: imageFile(), plant_id: plantId }, cookie)
    ).json()) as PhotoRow;

    const del = await jsonRequest(
      `/photos/${photo.id}`,
      "DELETE",
      {},
      { cookie },
    );
    expect(del.status).toBe(200);
    expect((await getRequest(`/photos/${photo.id}`, cookie)).status).toBe(404);
  });

  it("lets any authenticated user delete a photo (global access)", async () => {
    const { property, cookie } = await seedUserWithProperty({
      hexes: ["cell-a"],
    });
    const { id: plantId } = await seedPlant(property.id, "cell-a");
    const photo = (await (
      await upload({ file: imageFile(), plant_id: plantId }, cookie)
    ).json()) as PhotoRow;
    const outsider = await sessionCookie((await seedUser()).id);
    expect(
      (
        await jsonRequest(
          `/photos/${photo.id}`,
          "DELETE",
          {},
          { cookie: outsider },
        )
      ).status,
    ).toBe(200);
  });
});
