// ARB-071 backend: map tile config.
// Returns a MapLibre raster source. Layers:
//
//   `?layer=street`         — MML maastokartta if MML_API_KEY set, else OSM.
//   `?layer=satellite`      — Auto: MML ortokuva if key set, else Esri.
//   `?layer=satellite-mml`  — Force MML ortokuva (returns Esri with
//                              `fellBack: true` if no key).
//   `?layer=satellite-esri` — Force Esri World Imagery.
//
// Why both providers: MML's free WGS84_Pseudo-Mercator caps at z=18
// (~60 cm/pixel). Esri serves real z=19 tiles in many areas — sometimes
// sharper at very-high zoom even though MML's z=18 is technically higher
// resolution. Letting the user toggle per-location lets them pick the better
// imagery for their actual property.
//
// SECURITY: when MML is in use, the API key is included in the URL so the
// browser can fetch tiles directly. MML keys are low-value and the app is
// non-commercial; if we ever need to hide them we can proxy tiles through
// the Worker (free egress on Cloudflare anyway).

import { Hono } from "hono";
import { readSession } from "../lib/auth";

type Bindings = {
  MML_API_KEY: string;
  JWT_SECRET: string;
};

export const mapRoutes = new Hono<{ Bindings: Bindings }>();

interface MapConfig {
  source: "mml-street" | "mml-satellite" | "osm" | "esri-satellite";
  tiles: string[];
  attribution: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  /** True when the user requested a provider we couldn't honour (e.g. MML
   *  without a key) and we substituted another. UI can show a hint. */
  fellBack?: boolean;
}

const OSM_CONFIG: MapConfig = {
  source: "osm",
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  attribution: "© OpenStreetMap contributors",
  tileSize: 256,
  minZoom: 0,
  maxZoom: 19,
};

const ESRI_SATELLITE_CONFIG: MapConfig = {
  source: "esri-satellite",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  attribution:
    "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, GIS User Community",
  tileSize: 256,
  minZoom: 0,
  // Esri World Imagery goes to ~19 in most areas, ~17–18 outside dense cities.
  maxZoom: 19,
};

function mmlSatelliteConfig(apiKey: string): MapConfig {
  return {
    source: "mml-satellite",
    tiles: [
      `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/ortokuva/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.jpg?api-key=${apiKey}`,
    ],
    attribution: "© Maanmittauslaitos / NLS Finland",
    tileSize: 256,
    minZoom: 0,
    // Free WGS84_Pseudo-Mercator matrix set tops out at level 18 — verified
    // via WMTSCapabilities. Setting this honestly so MapLibre doesn't request
    // 404'd higher tiles; it'll still upscale the z=18 tile when zoomed in.
    maxZoom: 18,
  };
}

function mmlStreetConfig(apiKey: string): MapConfig {
  return {
    source: "mml-street",
    tiles: [
      `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${apiKey}`,
    ],
    attribution: "© Maanmittauslaitos / NLS Finland",
    tileSize: 256,
    minZoom: 0,
    maxZoom: 18,
  };
}

mapRoutes.get("/config", async (c) => {
  // Auth-required: don't broadcast which provider/key we use to anonymous bots.
  const session = await readSession(c, c.env.JWT_SECRET);
  if (!session) return c.json({ error: "Not authenticated" }, 401);

  const layerRaw = c.req.query("layer") ?? "street";
  const apiKey = c.env.MML_API_KEY;
  const hasMml = !!apiKey && apiKey.trim().length > 0;

  switch (layerRaw) {
    case "satellite-esri":
      return c.json(ESRI_SATELLITE_CONFIG);

    case "satellite-mml":
      if (hasMml) return c.json(mmlSatelliteConfig(apiKey));
      // No key — fall back to Esri so the UI doesn't break.
      return c.json({ ...ESRI_SATELLITE_CONFIG, fellBack: true });

    case "satellite":
      // Back-compat: auto-pick. Prefers MML when configured.
      return c.json(
        hasMml ? mmlSatelliteConfig(apiKey) : ESRI_SATELLITE_CONFIG,
      );

    case "street":
    default:
      return c.json(hasMml ? mmlStreetConfig(apiKey) : OSM_CONFIG);
  }
});
