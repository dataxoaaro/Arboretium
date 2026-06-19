import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  request,
  getRequest,
  jsonRequest,
  seedUser,
  seedProperty,
} from "./helpers";

describe("admin gate (LOCAL_ADMIN)", () => {
  it("404s every admin route when LOCAL_ADMIN is not 'true'", async () => {
    const res = await request(
      "/admin/properties",
      {},
      { LOCAL_ADMIN: "false" },
    );
    expect(res.status).toBe(404);
  });

  it("serves admin routes when LOCAL_ADMIN is 'true'", async () => {
    // Default test env sets LOCAL_ADMIN = "true".
    expect((await getRequest("/admin/properties")).status).toBe(200);
  });
});

describe("admin properties", () => {
  it("creates a property and seeds the owner as a member", async () => {
    const owner = await seedUser();
    const res = await jsonRequest("/admin/properties", "POST", {
      owner_id: owner.id,
      name: "Cottage",
    });
    expect(res.status).toBe(200);
    const prop = (await res.json()) as { id: string; name: string };
    expect(prop.name).toBe("Cottage");

    const member = await env.DB.prepare(
      "SELECT * FROM property_members WHERE property_id = ? AND user_id = ?",
    )
      .bind(prop.id, owner.id)
      .first();
    expect(member).not.toBeNull();
  });

  it("rejects missing owner_id or name", async () => {
    expect(
      (await jsonRequest("/admin/properties", "POST", { name: "x" })).status,
    ).toBe(400);
  });

  it("rejects a non-existent owner", async () => {
    const res = await jsonRequest("/admin/properties", "POST", {
      owner_id: "ghost",
      name: "x",
    });
    expect(res.status).toBe(400);
  });

  it("updates a property", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { name: "Before" });
    const res = await jsonRequest(`/admin/properties/${prop.id}`, "PATCH", {
      name: "After",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe("After");
  });

  it("archives then restores a property", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id);

    const del = await jsonRequest(`/admin/properties/${prop.id}`, "DELETE", {});
    expect(del.status).toBe(200);
    let row = await env.DB.prepare(
      "SELECT archived_at FROM properties WHERE id = ?",
    )
      .bind(prop.id)
      .first<{ archived_at: number | null }>();
    expect(row?.archived_at).not.toBeNull();

    const restore = await jsonRequest(
      `/admin/properties/${prop.id}/restore`,
      "POST",
      {},
    );
    expect(restore.status).toBe(200);
    row = await env.DB.prepare(
      "SELECT archived_at FROM properties WHERE id = ?",
    )
      .bind(prop.id)
      .first<{ archived_at: number | null }>();
    expect(row?.archived_at).toBeNull();
  });
});

describe("admin members", () => {
  it("adds and removes a member by email", async () => {
    const owner = await seedUser();
    const friend = await seedUser();
    const prop = await seedProperty(owner.id);

    const add = await jsonRequest(
      `/admin/properties/${prop.id}/members`,
      "POST",
      { email: friend.email, added_by: owner.id },
    );
    expect(add.status).toBe(200);

    const members = (await (
      await getRequest(`/admin/properties/${prop.id}/members`)
    ).json()) as { id: string }[];
    expect(members.some((m) => m.id === friend.id)).toBe(true);

    const remove = await jsonRequest(
      `/admin/properties/${prop.id}/members/${friend.id}`,
      "DELETE",
      {},
    );
    expect(remove.status).toBe(200);
  });

  it("404s adding an unknown email", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id);
    const res = await jsonRequest(
      `/admin/properties/${prop.id}/members`,
      "POST",
      { email: "nobody@test.local", added_by: owner.id },
    );
    expect(res.status).toBe(404);
  });
});

describe("admin users", () => {
  it("lists users with a membership count", async () => {
    const user = await seedUser();
    const prop = await seedProperty(user.id);
    await jsonRequest(`/admin/properties/${prop.id}/members`, "POST", {
      email: user.email,
      added_by: user.id,
    });
    const rows = (await (await getRequest("/admin/users")).json()) as {
      id: string;
      membership_count: number;
    }[];
    const me = rows.find((r) => r.id === user.id);
    expect(me?.membership_count).toBe(1);
  });

  it("deletes a user", async () => {
    const user = await seedUser();
    const res = await jsonRequest(`/admin/users/${user.id}`, "DELETE", {});
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind(user.id)
      .first();
    expect(row).toBeNull();
  });

  it("issues a reset link for a user", async () => {
    const user = await seedUser();
    const issuer = await seedUser();
    const res = await jsonRequest(
      `/admin/users/${user.id}/reset-link`,
      "POST",
      {
        issued_by: issuer.id,
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expires_at: number };
    expect(typeof body.token).toBe("string");
    expect(body.expires_at).toBeGreaterThan(Date.now());
  });
});

describe("admin stats", () => {
  it("returns aggregate counts", async () => {
    const user = await seedUser();
    await seedProperty(user.id);
    const res = await getRequest("/admin/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: number;
      properties_active: number;
    };
    expect(body.users).toBeGreaterThanOrEqual(1);
    expect(body.properties_active).toBeGreaterThanOrEqual(1);
  });
});
