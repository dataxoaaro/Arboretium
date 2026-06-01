// Map config fetched from /api/map/config. Returned shape mirrors the Worker.
//
// Layer choices:
//   "street"          → MML maastokartta if a key is set, else OSM
//   "satellite"       → auto: MML ortokuva if a key is set, else Esri
//   "satellite-mml"   → force MML (worker substitutes Esri + fellBack=true if no key)
//   "satellite-esri"  → force Esri World Imagery
//
// Use the explicit "satellite-mml" / "satellite-esri" choices when you want
// to compare imagery side-by-side. The generic "satellite" exists for callers
// that don't care which provider serves the tiles.

export type BasemapLayer =
  | "street"
  | "satellite"
  | "satellite-mml"
  | "satellite-esri";

export interface MapConfig {
  source: "mml-street" | "mml-satellite" | "osm" | "esri-satellite";
  tiles: string[];
  attribution: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  /** Set when the worker had to substitute a different provider (e.g. asked
   *  for MML without a key configured). */
  fellBack?: boolean;
}

export async function fetchMapConfig(
  layer: BasemapLayer = "street",
): Promise<MapConfig> {
  const url =
    layer === "street"
      ? "/api/map/config"
      : `/api/map/config?layer=${encodeURIComponent(layer)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`map config: ${res.status}`);
  return res.json() as Promise<MapConfig>;
}
