import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  getRequest,
  jsonRequest,
  seedUser,
  seedProperty,
  sessionCookie,
} from "./helpers";

// Admin endpoints are now gated by an authenticated session (any signed-in
// user), not the LOCAL_ADMIN env var. Property access is platform-wide, so
// there is no owner/membership requirement on create.

/** Seed a user and return a valid session cookie. */
async function adminCookie(): Promise<string> {
  const u = await seedUser();
  return sessionCookie(u.id);
}

describe("admin gate (auth)", () => {
  it("401s admin routes when signed out", async () => {
    expect((await getRequest("/admin/properties")).status).toBe(401);
  });

  it("serves admin routes to a signed-in user", async () => {
    const res = await getRequest("/admin/properties", await adminCookie());
    expect(res.status).toBe(200);
  });
});

describe("admin properties", () => {
  it("creates a property owned by the creator", async () => {
    const u = await seedUser();
    const res = await jsonRequest(
      "/admin/properties",
      "POST",
      { name: "Cottage" },
      { cookie: await sessionCookie(u.id) },
    );
    expect(res.status).toBe(200);
    const prop = (await res.json()) as {
      id: string;
      name: string;
      owner_id: string;
    };
    expect(prop.name).toBe("Cottage");
    expect(prop.owner_id).toBe(u.id);
  });

  it("rejects a missing name", async () => {
    const res = await jsonRequest(
      "/admin/properties",
      "POST",
      {},
      { cookie: await adminCookie() },
    );
    expect(res.status).toBe(400);
  });

  it("updates a property", async () => {
    const owner = await seedUser();
    const prop = await seedProperty(owner.id, { name: "Before" });
    const res = await jsonRequest(
      `/admin/properties/${prop.id}`,
      "PATCH",
      { name: "After" },
      { cookie: await adminCookie() },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe("After");
  });

  it("archives then restores a property", async () => {
    const cookie = await adminCookie();
    const owner = await seedUser();
    const prop = await seedProperty(owner.id);

    const del = await jsonRequest(
      `/admin/properties/${prop.id}`,
      "DELETE",
      {},
      { cookie },
    );
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
      { cookie },
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

describe("admin users", () => {
  it("lists users", async () => {
    const cookie = await adminCookie();
    const user = await seedUser();
    const rows = (await (await getRequest("/admin/users", cookie)).json()) as {
      id: string;
    }[];
    expect(rows.some((r) => r.id === user.id)).toBe(true);
  });

  it("deletes a user", async () => {
    const cookie = await adminCookie();
    const user = await seedUser();
    const res = await jsonRequest(
      `/admin/users/${user.id}`,
      "DELETE",
      {},
      { cookie },
    );
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind(user.id)
      .first();
    expect(row).toBeNull();
  });

  it("issues a reset link for a user", async () => {
    const cookie = await adminCookie();
    const user = await seedUser();
    const issuer = await seedUser();
    const res = await jsonRequest(
      `/admin/users/${user.id}/reset-link`,
      "POST",
      { issued_by: issuer.id },
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expires_at: number };
    expect(typeof body.token).toBe("string");
    expect(body.expires_at).toBeGreaterThan(Date.now());
  });
});

describe("admin stats", () => {
  it("returns aggregate counts", async () => {
    const cookie = await adminCookie();
    const user = await seedUser();
    await seedProperty(user.id);
    const res = await getRequest("/admin/stats", cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: number;
      properties_active: number;
    };
    expect(body.users).toBeGreaterThanOrEqual(1);
    expect(body.properties_active).toBeGreaterThanOrEqual(1);
  });
});
