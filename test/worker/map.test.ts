import { describe, it, expect } from "vitest";
import { request, sessionCookie } from "./helpers";

interface MapConfig {
  source: string;
  tiles: string[];
  maxZoom: number;
  fellBack?: boolean;
}

async function config(
  layer: string | null,
  cookie: string,
  envOverride?: Record<string, unknown>,
): Promise<{ status: number; body: MapConfig }> {
  const path = layer ? `/map/config?layer=${layer}` : "/map/config";
  const res = await request(path, { headers: { Cookie: cookie } }, envOverride);
  return { status: res.status, body: (await res.json()) as MapConfig };
}

describe("GET /map/config", () => {
  it("requires authentication", async () => {
    const res = await request("/map/config");
    expect(res.status).toBe(401);
  });

  describe("without an MML key", () => {
    it("serves OSM for the street layer", async () => {
      const cookie = await sessionCookie("user-map");
      expect((await config("street", cookie)).body.source).toBe("osm");
    });

    it("defaults to the street layer", async () => {
      const cookie = await sessionCookie("user-map");
      expect((await config(null, cookie)).body.source).toBe("osm");
    });

    it("serves Esri for the satellite layer", async () => {
      const cookie = await sessionCookie("user-map");
      expect((await config("satellite", cookie)).body.source).toBe(
        "esri-satellite",
      );
    });

    it("forces Esri for satellite-esri", async () => {
      const cookie = await sessionCookie("user-map");
      expect((await config("satellite-esri", cookie)).body.source).toBe(
        "esri-satellite",
      );
    });

    it("falls back to Esri (fellBack) when MML is requested without a key", async () => {
      const cookie = await sessionCookie("user-map");
      const { body } = await config("satellite-mml", cookie);
      expect(body.source).toBe("esri-satellite");
      expect(body.fellBack).toBe(true);
    });
  });

  describe("with an MML key", () => {
    const withKey = { MML_API_KEY: "key-abc-123" };

    it("serves MML topographic tiles for the street layer", async () => {
      const cookie = await sessionCookie("user-map");
      const { body } = await config("street", cookie, withKey);
      expect(body.source).toBe("mml-street");
      expect(body.tiles[0]).toContain("api-key=key-abc-123");
    });

    it("serves MML orthophotos for the satellite layer", async () => {
      const cookie = await sessionCookie("user-map");
      const { body } = await config("satellite", cookie, withKey);
      expect(body.source).toBe("mml-satellite");
      expect(body.maxZoom).toBe(18);
    });

    it("honors satellite-mml with a key", async () => {
      const cookie = await sessionCookie("user-map");
      const { body } = await config("satellite-mml", cookie, withKey);
      expect(body.source).toBe("mml-satellite");
      expect(body.fellBack).toBeUndefined();
    });
  });
});
