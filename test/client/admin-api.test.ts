import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adminApi, AdminApiError } from "../../src/admin/admin-api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function url(): string {
  return fetchMock.mock.calls.at(-1)![0] as string;
}
function init(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit;
}

describe("adminApi routes", () => {
  it("prefixes /api/admin and sends credentials", async () => {
    await adminApi.listProperties();
    expect(url()).toBe("/api/admin/properties");
    expect(init().credentials).toBe("include");
  });

  it("createProperty / updateProperty / archive / restore", async () => {
    await adminApi.createProperty({ name: "P" });
    expect([url(), init().method]).toEqual(["/api/admin/properties", "POST"]);
    await adminApi.updateProperty("p1", { name: "X" });
    expect([url(), init().method]).toEqual([
      "/api/admin/properties/p1",
      "PATCH",
    ]);
    await adminApi.archiveProperty("p1");
    expect([url(), init().method]).toEqual([
      "/api/admin/properties/p1",
      "DELETE",
    ]);
    await adminApi.restoreProperty("p1");
    expect([url(), init().method]).toEqual([
      "/api/admin/properties/p1/restore",
      "POST",
    ]);
  });

  it("user + diagnostics endpoints", async () => {
    await adminApi.listUsers();
    expect(url()).toBe("/api/admin/users");
    await adminApi.deleteUser("u1");
    expect([url(), init().method]).toEqual(["/api/admin/users/u1", "DELETE"]);
    await adminApi.generateResetLink("u1", "admin");
    expect([url(), init().method]).toEqual([
      "/api/admin/users/u1/reset-link",
      "POST",
    ]);
    await adminApi.stats();
    expect(url()).toBe("/api/admin/stats");
  });

  it("throws AdminApiError with the status on failure", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      ),
    );
    await expect(adminApi.listUsers()).rejects.toBeInstanceOf(AdminApiError);
    try {
      await adminApi.listUsers();
    } catch (e) {
      expect((e as AdminApiError).status).toBe(404);
      expect((e as AdminApiError).message).toBe("Not found");
    }
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("nope", { status: 500 })),
    );
    try {
      await adminApi.stats();
      throw new Error("should throw");
    } catch (e) {
      expect((e as AdminApiError).message).toBe("Request failed (500)");
    }
  });
});
