import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiCallError } from "../../src/lib/api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonErr(status: number, error?: string): Response {
  return new Response(error ? JSON.stringify({ error }) : "not json", {
    status,
  });
}

/** The [url, init] of the most recent fetch call. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  return call as [string, RequestInit];
}

describe("request wrapper", () => {
  it("prefixes /api, sends JSON content-type and credentials", async () => {
    fetchMock.mockResolvedValue(jsonOk({ ok: true }));
    await api.me();
    const [url, init] = lastCall();
    expect(url).toBe("/api/auth/me");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws ApiCallError carrying the status and server message", async () => {
    fetchMock.mockResolvedValue(jsonErr(401, "Invalid email or password"));
    await expect(api.login({ email: "a@b.c", password: "x" })).rejects.toThrow(
      ApiCallError,
    );
    fetchMock.mockResolvedValue(jsonErr(401, "Invalid email or password"));
    try {
      await api.login({ email: "a@b.c", password: "x" });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiCallError);
      expect((e as ApiCallError).status).toBe(401);
      expect((e as ApiCallError).message).toBe("Invalid email or password");
    }
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(jsonErr(500));
    try {
      await api.me();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ApiCallError).message).toBe("Request failed (500)");
    }
  });
});

describe("auth endpoints", () => {
  it("register posts the credentials", async () => {
    fetchMock.mockResolvedValue(jsonOk({ id: "u1" }));
    await api.register({
      email: "a@b.c",
      password: "pw",
      display_name: "A",
      site_password: "s",
    });
    const [url, init] = lastCall();
    expect(url).toBe("/api/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ email: "a@b.c" });
  });

  it("login / logout / changePassword target the right routes", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonOk({ ok: true })));
    await api.login({ email: "a@b.c", password: "x" });
    expect(lastCall()[0]).toBe("/api/auth/login");
    await api.logout();
    expect(lastCall()).toEqual([
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    ]);
    await api.changePassword({ current_password: "a", new_password: "b" });
    expect(lastCall()[0]).toBe("/api/auth/change-password");
  });

  it("resetPassword url-encodes the token and sends only the new password", async () => {
    fetchMock.mockResolvedValue(jsonOk({ ok: true }));
    await api.resetPassword({ token: "a/b c", new_password: "secret" });
    const [url, init] = lastCall();
    expect(url).toBe("/api/auth/reset/a%2Fb%20c");
    expect(JSON.parse(init.body as string)).toEqual({ new_password: "secret" });
  });
});

describe("property + plant endpoints", () => {
  it("listProperties / getProperty", async () => {
    fetchMock.mockResolvedValue(jsonOk([]));
    await api.listProperties();
    expect(lastCall()[0]).toBe("/api/properties");
    fetchMock.mockResolvedValue(jsonOk({ id: "p" }));
    await api.getProperty("p1");
    expect(lastCall()[0]).toBe("/api/properties/p1");
  });

  it("listPlants encodes the property id", async () => {
    fetchMock.mockResolvedValue(jsonOk([]));
    await api.listPlants("p/1");
    expect(lastCall()[0]).toBe("/api/plants?property_id=p%2F1");
  });

  it("createPlant / updatePlant / deletePlant", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonOk({ id: "x" })));
    await api.createPlant({
      property_id: "p",
      h3_res15: "c",
      lat: 1,
      lng: 2,
      common_name: "Oak",
    });
    expect(lastCall()).toEqual([
      "/api/plants",
      expect.objectContaining({ method: "POST" }),
    ]);
    await api.updatePlant("x", { common_name: "Elm" });
    expect(lastCall()).toEqual([
      "/api/plants/x",
      expect.objectContaining({ method: "PATCH" }),
    ]);
    await api.deletePlant("x");
    expect(lastCall()).toEqual([
      "/api/plants/x",
      expect.objectContaining({ method: "DELETE" }),
    ]);
  });
});

describe("photo endpoints", () => {
  it("uploadPhoto builds a multipart form with file + metadata", async () => {
    fetchMock.mockResolvedValue(jsonOk({ id: "ph" }));
    await api.uploadPhoto({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      plantId: "plant-1",
      caption: "hi",
      takenAt: 123,
    });
    const [url, init] = lastCall();
    expect(url).toBe("/api/photos");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("plant_id")).toBe("plant-1");
    expect(form.get("caption")).toBe("hi");
    expect(form.get("taken_at")).toBe("123");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("uploadPhoto throws ApiCallError on failure", async () => {
    fetchMock.mockResolvedValue(jsonErr(413, "File too large"));
    await expect(
      api.uploadPhoto({
        blob: new Blob([]),
        mimeType: "image/png",
        cellPropertyId: "p",
        cellH3: "c",
      }),
    ).rejects.toBeInstanceOf(ApiCallError);
  });

  it("listPhotosForPlant / updatePhoto / deletePhoto", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonOk([])));
    await api.listPhotosForPlant("pl");
    expect(lastCall()[0]).toBe("/api/photos?plant_id=pl");
    fetchMock.mockImplementation(() => Promise.resolve(jsonOk({ id: "ph" })));
    await api.updatePhoto("ph", "cap");
    expect(lastCall()[0]).toBe("/api/photos/ph");
    await api.deletePhoto("ph");
    expect(lastCall()).toEqual([
      "/api/photos/ph",
      expect.objectContaining({ method: "DELETE" }),
    ]);
  });

  it("photoUrl returns the proxied path", () => {
    expect(api.photoUrl("abc")).toBe("/api/photos/abc");
  });
});
