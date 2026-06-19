import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchMapConfig } from "../../src/lib/api-map";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 });
}

describe("fetchMapConfig", () => {
  it("requests the bare endpoint for the street layer", async () => {
    fetchMock.mockResolvedValue(ok({ source: "osm" }));
    const cfg = await fetchMapConfig("street");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/map/config");
    expect(cfg.source).toBe("osm");
  });

  it("defaults to the street layer", async () => {
    fetchMock.mockResolvedValue(ok({ source: "osm" }));
    await fetchMapConfig();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/map/config");
  });

  it("passes other layers as a query param", async () => {
    fetchMock.mockResolvedValue(ok({ source: "esri-satellite" }));
    await fetchMapConfig("satellite-esri");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/map/config?layer=satellite-esri",
    );
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    await expect(fetchMapConfig("satellite")).rejects.toThrow(
      "map config: 401",
    );
  });
});
