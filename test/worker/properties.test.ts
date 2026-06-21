import { describe, it, expect } from "vitest";
import { getRequest, seedUser, seedProperty, sessionCookie } from "./helpers";

describe("GET /properties", () => {
  it("requires authentication", async () => {
    expect((await getRequest("/properties")).status).toBe(401);
  });

  it("returns active properties sorted by name", async () => {
    const user = await seedUser();
    const cookie = await sessionCookie(user.id);
    await seedProperty(user.id, { name: "Beta" });
    await seedProperty(user.id, { name: "Alpha" });

    const res = await getRequest("/properties", cookie);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("excludes archived properties", async () => {
    const user = await seedUser();
    const cookie = await sessionCookie(user.id);
    await seedProperty(user.id, {
      name: "Gone",
      archived: true,
    });

    const rows = (await (await getRequest("/properties", cookie)).json()) as {
      name: string;
    }[];
    expect(rows).toHaveLength(0);
  });

  it("returns every active property to any authenticated user", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    await seedProperty(owner.id, { name: "Shared" });

    const rows = (await (
      await getRequest("/properties", await sessionCookie(other.id))
    ).json()) as unknown[];
    expect(rows).toHaveLength(1);
  });
});

describe("GET /properties/:id", () => {
  it("returns an active property", async () => {
    const user = await seedUser();
    const prop = await seedProperty(user.id, { name: "Mine" });
    const res = await getRequest(
      `/properties/${prop.id}`,
      await sessionCookie(user.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: prop.id });
  });

  it("returns any active property to any authenticated user", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const prop = await seedProperty(owner.id);
    const res = await getRequest(
      `/properties/${prop.id}`,
      await sessionCookie(other.id),
    );
    expect(res.status).toBe(200);
  });

  it("404s for an archived property", async () => {
    const user = await seedUser();
    const prop = await seedProperty(user.id, { archived: true });
    const res = await getRequest(
      `/properties/${prop.id}`,
      await sessionCookie(user.id),
    );
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await getRequest("/properties/anything")).status).toBe(401);
  });
});
