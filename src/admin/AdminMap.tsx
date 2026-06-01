// Admin property-editor map: polygon draw + res-15 hex picker.
//
// Resolution choice (matches schema and plant validation): the property's
// `included_hexes` is a JSON array of res-15 H3 indices, and a plant's
// `h3_res15` must literally appear in that set (worker/routes/plants.ts).
//
// Modes:
//   draw   — click to add a vertex; right-click / "Finish" closes the ring.
//   hexes  — click toggles a single hex inside the boundary.
//   view   — read-only.
//
// State model: `vertices` is the single source of truth for the boundary
// shape. `polygon` is derived (3+ vertices in non-draw mode). This means
// dragging a vertex automatically updates the polygon, the candidate-hex
// fill, and the included-hex view — no manual rebuild needed.
//
// Vertex dragging: mousedown on the vertex layer disables map pan, follows
// the cursor on mousemove, and re-enables pan on mouseup. Works in draw
// and hexes modes; disabled in view mode.

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  fetchMapConfig,
  type BasemapLayer,
  type MapConfig,
} from "@/lib/api-map";
import {
  cellAtPoint,
  cellRing,
  cellsInPolygon,
  cellCenter,
  RES_PLANT,
  type H3Index,
} from "@/lib/h3";
import { BasemapToggle } from "@/components/map/BasemapToggle";

const RES_PICKER = RES_PLANT; // 15 — must equal plants.h3_res15 resolution.

// Hard cap so a wildly-large polygon doesn't lock the browser. Res-15 cells
// are ~0.9 m², so 50k cells ≈ 4.5 ha = a generously large arboretum.
const MAX_CANDIDATE_HEXES = 50_000;

const SRC_BASEMAP = "basemap";
const LAYER_BASEMAP = "basemap";
const SRC_BOUNDARY = "admin-boundary";
const SRC_VERTICES = "admin-vertices";
const SRC_HEX = "admin-hex";
const LAYER_BOUNDARY_FILL = "admin-boundary-fill";
const LAYER_BOUNDARY_LINE = "admin-boundary-line";
const LAYER_VERTICES = "admin-vertices";
const LAYER_HEX_FILL = "admin-hex-fill";
const LAYER_HEX_LINE = "admin-hex-line";

export interface BoundaryShape {
  /** GeoJSON Polygon. Ring is closed (first === last). */
  polygon: GeoJSON.Polygon | null;
  /** Res-15 H3 indices the user wants included in the property. */
  includedHexes: H3Index[];
  /** Centroid lat/lng for the property record. */
  center: { lat: number; lng: number } | null;
}

interface AdminMapProps {
  initial?: BoundaryShape;
  initialView?: { lng: number; lat: number; zoom: number };
  onChange: (next: BoundaryShape) => void;
}

type Mode = "draw" | "hexes" | "view";

export function AdminMap({ initial, initialView, onChange }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const attribCtrlRef = useRef<maplibregl.AttributionControl | null>(null);

  // Default to MML satellite for boundary drawing in Finland — high-res
  // ortophotos until z=18, then upscaled. User can flip to Esri if they
  // need sharper tiles past z=18 in their area (Esri serves real z=19).
  const [basemap, setBasemap] = useState<BasemapLayer>("satellite-mml");
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerHint, setProviderHint] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(initial?.polygon ? "view" : "draw");

  // Single source of truth for the boundary shape.
  const [vertices, setVertices] = useState<[number, number][]>(() =>
    initial?.polygon ? ringWithoutClose(initial.polygon) : [],
  );
  const [includedHexes, setIncludedHexes] = useState<Set<H3Index>>(
    () => new Set(initial?.includedHexes ?? []),
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Derived polygon — exists only outside draw mode with 3+ vertices.
  const polygon = useMemo<GeoJSON.Polygon | null>(() => {
    if (mode === "draw" || vertices.length < 3) return null;
    return { type: "Polygon", coordinates: [closeRing(vertices)] };
  }, [vertices, mode]);

  // Refs so map handlers always read latest state without rebinding.
  const modeRef = useRef(mode);
  const verticesRef = useRef(vertices);
  const polygonRef = useRef(polygon);
  const includedRef = useRef(includedHexes);
  const draggedVertexRef = useRef<number | null>(null);
  modeRef.current = mode;
  verticesRef.current = vertices;
  polygonRef.current = polygon;
  includedRef.current = includedHexes;

  // --- map init ---

  useEffect(() => {
    fetchMapConfig(basemap)
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.fellBack) {
          setProviderHint(
            "MML key not configured — falling back to Esri. See README → MML setup.",
          );
        }
      })
      .catch((err: Error) => setError(err.message));
    // Only fetch on mount; basemap changes are handled by the swap effect
    // below so map state (zoom/pan) is preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!config || !containerRef.current || mapRef.current) return;

    const center = initial?.center
      ? { lng: initial.center.lng, lat: initial.center.lat }
      : initialView
        ? { lng: initialView.lng, lat: initialView.lat }
        : { lng: 25.7, lat: 62.0 };
    // Res-15 cells only become visually meaningful from zoom ~18 up.
    const zoom = initial?.center || initialView ? (initialView?.zoom ?? 18) : 5;

    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false, // we add a controlled instance below
      style: {
        version: 8,
        sources: {
          [SRC_BASEMAP]: {
            type: "raster",
            tiles: config.tiles,
            tileSize: config.tileSize,
            attribution: config.attribution,
            minzoom: config.minZoom,
            maxzoom: config.maxZoom,
          },
        },
        layers: [{ id: LAYER_BASEMAP, type: "raster", source: SRC_BASEMAP }],
      },
      center: [center.lng, center.lat],
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }));
    const attrib = new maplibregl.AttributionControl({ compact: true });
    map.addControl(attrib);
    attribCtrlRef.current = attrib;

    map.on("load", () => {
      addOverlayLayers(map);
      paintBoundary(map, polygonRef.current, verticesRef.current);
      paintHexes(map, polygonRef.current, includedRef.current);
    });

    bindInteractions(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // --- basemap swap (preserve camera + overlays) ---
  //
  // Critical: do NOT call setConfig(cfg) here. The init effect above is keyed
  // on `config`, so a state update would tear the entire map down (cleanup
  // calls map.remove()) and rebuild it — losing all in-flight drawing state.
  // We mutate the map directly and leave React state alone.

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    let cancelled = false;
    fetchMapConfig(basemap)
      .then((cfg) => {
        if (cancelled) return;
        if (map.getLayer(LAYER_BASEMAP)) map.removeLayer(LAYER_BASEMAP);
        if (map.getSource(SRC_BASEMAP)) map.removeSource(SRC_BASEMAP);
        map.addSource(SRC_BASEMAP, {
          type: "raster",
          tiles: cfg.tiles,
          tileSize: cfg.tileSize,
          attribution: cfg.attribution,
          minzoom: cfg.minZoom,
          maxzoom: cfg.maxZoom,
        });
        // Insert before the first overlay so basemap renders underneath.
        const beforeId = map.getLayer(LAYER_BOUNDARY_FILL)
          ? LAYER_BOUNDARY_FILL
          : undefined;
        map.addLayer(
          { id: LAYER_BASEMAP, type: "raster", source: SRC_BASEMAP },
          beforeId,
        );
        setProviderHint(
          cfg.fellBack
            ? "MML key not configured — falling back to Esri. See README → MML setup."
            : null,
        );
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [basemap]);

  // --- repaint on state change ---

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    paintBoundary(map, polygon, vertices);
  }, [polygon, vertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    paintHexes(map, polygon, includedHexes);
  }, [polygon, includedHexes]);

  useEffect(() => {
    onChange({
      polygon,
      includedHexes: Array.from(includedHexes),
      center: polygon ? polygonCentroid(polygon) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygon, includedHexes]);

  // --- map interactions ---

  function bindInteractions(map: maplibregl.Map) {
    map.on("click", (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;

      // Marker / vertex layers consume their own clicks via preventDefault.
      if (e.defaultPrevented) return;

      if (modeRef.current === "draw") {
        setVertices((prev) => [...prev, [lng, lat]]);
      } else if (modeRef.current === "hexes") {
        if (!polygonRef.current) return;
        const cell = cellAtPoint({ lat, lng }, RES_PICKER);
        if (!isCellInsidePolygon(cell, polygonRef.current)) return;
        setIncludedHexes((prev) => {
          const next = new Set(prev);
          if (next.has(cell)) {
            next.delete(cell);
          } else {
            next.add(cell);
          }
          return next;
        });
      }
    });

    map.on("contextmenu", (e) => {
      e.preventDefault();
      if (modeRef.current === "draw" && verticesRef.current.length >= 3) {
        finishDraw();
      }
    });

    // --- vertex dragging ---

    map.on("mouseenter", LAYER_VERTICES, () => {
      if (modeRef.current === "view") return;
      map.getCanvas().style.cursor = "grab";
    });
    map.on("mouseleave", LAYER_VERTICES, () => {
      if (draggedVertexRef.current === null) {
        map.getCanvas().style.cursor = "";
      }
    });

    map.on("mousedown", LAYER_VERTICES, (e) => {
      if (modeRef.current === "view") return;
      const feature = e.features?.[0];
      const idx = feature?.properties?.idx;
      if (typeof idx !== "number") return;
      e.preventDefault(); // also stops the click handler above firing.
      draggedVertexRef.current = idx;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });

    // Touch fallback for the drag handle.
    map.on("touchstart", LAYER_VERTICES, (e) => {
      if (modeRef.current === "view") return;
      const feature = e.features?.[0];
      const idx = feature?.properties?.idx;
      if (typeof idx !== "number") return;
      e.preventDefault();
      draggedVertexRef.current = idx;
      map.dragPan.disable();
    });

    map.on("mousemove", (e) => {
      const idx = draggedVertexRef.current;
      if (idx === null) return;
      setVertices((prev) => {
        if (idx >= prev.length) return prev;
        const next = [...prev];
        next[idx] = [e.lngLat.lng, e.lngLat.lat];
        return next;
      });
    });

    map.on("touchmove", (e) => {
      const idx = draggedVertexRef.current;
      if (idx === null) return;
      e.preventDefault();
      setVertices((prev) => {
        if (idx >= prev.length) return prev;
        const next = [...prev];
        next[idx] = [e.lngLat.lng, e.lngLat.lat];
        return next;
      });
    });

    map.on("mouseup", () => endDrag(map));
    map.on("touchend", () => endDrag(map));
  }

  function endDrag(map: maplibregl.Map) {
    if (draggedVertexRef.current === null) return;
    draggedVertexRef.current = null;
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
  }

  // --- mode actions ---

  function finishDraw() {
    if (verticesRef.current.length < 3) return;
    setMode("hexes");

    // Auto-select cells inside the polygon as a starting point, capped.
    const ring = closeRing(verticesRef.current);
    const cells = cellsInPolygon(ring, RES_PICKER);
    if (cells.length > MAX_CANDIDATE_HEXES) {
      setWarning(
        `Polygon covers ${cells.length.toLocaleString()} res-15 cells (cap is ${MAX_CANDIDATE_HEXES.toLocaleString()}). Boundary kept; hexes left empty — redraw smaller or pick by hand.`,
      );
      setIncludedHexes(new Set());
    } else {
      setWarning(null);
      setIncludedHexes(new Set(cells));
    }

    const map = mapRef.current;
    if (map) {
      const c = polygonCentroidFromRing(ring);
      map.flyTo({ center: [c.lng, c.lat], zoom: 18, duration: 600 });
    }
  }

  function clearAll() {
    if (
      !confirm(
        "Clear the boundary and hex selection? This cannot be undone via the UI.",
      )
    )
      return;
    setVertices([]);
    setIncludedHexes(new Set());
    setWarning(null);
    setMode("draw");
  }

  function undoLastVertex() {
    setVertices((prev) => prev.slice(0, -1));
  }

  function selectAllInPolygon() {
    if (!polygon) return;
    const cells = cellsInPolygon(toRing(polygon), RES_PICKER);
    if (cells.length > MAX_CANDIDATE_HEXES) {
      setWarning(
        `Cannot select all: ${cells.length.toLocaleString()} cells exceeds cap (${MAX_CANDIDATE_HEXES.toLocaleString()}).`,
      );
      return;
    }
    setWarning(null);
    setIncludedHexes(new Set(cells));
  }

  function clearHexSelection() {
    setIncludedHexes(new Set());
  }

  // --- search ---
  //
  // Accepts either:
  //   - "lat, lng" or "lat lng"  — parsed locally, flies to res-15 zoom (18)
  //   - free text                — geocoded via Nominatim (OSM), 1-result fit
  //
  // Nominatim is free, no API key, max 1 req/sec for interactive use:
  // https://operations.osmfoundation.org/policies/nominatim/

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const map = mapRef.current;
    if (!map) return;
    setError(null);

    const coordMatch = q.match(
      /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
    );
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        map.flyTo({ center: [lng, lat], zoom: 18, duration: 600 });
        return;
      }
      setError("Coordinates out of range (lat ±90, lng ±180)");
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const results = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
        boundingbox?: [string, string, string, string];
      }>;
      if (!Array.isArray(results) || results.length === 0) {
        setError(`No match for "${q}"`);
        return;
      }
      const r = results[0];
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lon);
      if (Array.isArray(r.boundingbox) && r.boundingbox.length === 4) {
        const [s, n, w, ee] = r.boundingbox.map(Number);
        map.fitBounds(
          [
            [w, s],
            [ee, n],
          ],
          { padding: 60, duration: 600, maxZoom: 18 },
        );
      } else {
        map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // --- render ---

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {error && (
        <div className="absolute top-2 left-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm rounded shadow">
          {error}
        </div>
      )}
      {warning && (
        <div className="absolute top-12 left-2 right-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-xs rounded shadow">
          {warning}
        </div>
      )}

      <div className="absolute top-2 left-2 bg-white/95 border border-black/10 rounded shadow flex text-xs">
        {(["draw", "hexes", "view"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={m === "hexes" && !polygon}
            className={`px-3 py-2 ${
              m === mode ? "bg-black/10 font-medium" : "hover:bg-black/5"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {m === "draw"
              ? "1. Draw boundary"
              : m === "hexes"
                ? "2. Pick hexes"
                : "View"}
          </button>
        ))}
      </div>

      <form
        onSubmit={runSearch}
        className="absolute top-2 left-1/2 -translate-x-1/2 bg-white/95 border border-black/10 rounded shadow flex text-xs w-[min(420px,calc(100%-280px))]"
      >
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder='Address or "lat, lng" — e.g. "Helsinki" or "60.17, 24.94"'
          className="flex-1 px-3 py-2 bg-transparent outline-none min-w-0"
        />
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-2 border-l border-black/10 hover:bg-black/5 disabled:opacity-50"
        >
          {searching ? "…" : "Go"}
        </button>
      </form>

      <div className="absolute top-2 right-12">
        <BasemapToggle
          value={basemap}
          onChange={setBasemap}
          fellBack={!!providerHint}
        />
      </div>

      {mode !== "view" && (
        <div className="absolute bottom-2 left-2 right-2 bg-white/95 border border-black/10 rounded shadow px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
          {mode === "draw" ? (
            <span className="text-fg/70">
              Click to add vertices ({vertices.length} so far). Drag a vertex to
              move it. Right-click or press Finish to close the polygon.
            </span>
          ) : (
            <span className="text-fg/70">
              Drag any vertex to refine the boundary. Click a hex to toggle.{" "}
              {includedHexes.size.toLocaleString()} included. Zoom ≥ 17 to see
              res-15 hexes.
            </span>
          )}
          <div className="flex-1" />
          {mode === "draw" && (
            <>
              <button
                type="button"
                onClick={undoLastVertex}
                disabled={vertices.length === 0}
                className="px-2 py-1 rounded bg-black/5 hover:bg-black/10 disabled:opacity-40"
              >
                Undo vertex
              </button>
              <button
                type="button"
                onClick={finishDraw}
                disabled={vertices.length < 3}
                className="px-2 py-1 rounded bg-fg text-bg hover:opacity-90 disabled:opacity-40"
              >
                Finish boundary
              </button>
            </>
          )}
          {mode === "hexes" && (
            <>
              <button
                type="button"
                onClick={selectAllInPolygon}
                className="px-2 py-1 rounded bg-black/5 hover:bg-black/10"
              >
                Select all in polygon
              </button>
              <button
                type="button"
                onClick={clearHexSelection}
                className="px-2 py-1 rounded bg-black/5 hover:bg-black/10"
              >
                Deselect all
              </button>
            </>
          )}
          {(polygon || vertices.length > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- map setup helpers ---

function addOverlayLayers(map: maplibregl.Map): void {
  map.addSource(SRC_BOUNDARY, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: LAYER_BOUNDARY_FILL,
    type: "fill",
    source: SRC_BOUNDARY,
    paint: { "fill-color": "rgba(31, 111, 235, 0.10)" },
  });
  map.addLayer({
    id: LAYER_BOUNDARY_LINE,
    type: "line",
    source: SRC_BOUNDARY,
    paint: { "line-color": "#1f6feb", "line-width": 2 },
  });

  map.addSource(SRC_VERTICES, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: LAYER_VERTICES,
    type: "circle",
    source: SRC_VERTICES,
    paint: {
      "circle-radius": 7,
      "circle-color": "#1f6feb",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });

  map.addSource(SRC_HEX, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: LAYER_HEX_FILL,
    type: "fill",
    source: SRC_HEX,
    minzoom: 17,
    paint: {
      "fill-color": [
        "case",
        ["get", "included"],
        "rgba(34, 139, 34, 0.30)",
        "rgba(0, 0, 0, 0.04)",
      ],
    },
  });
  map.addLayer({
    id: LAYER_HEX_LINE,
    type: "line",
    source: SRC_HEX,
    minzoom: 17,
    paint: {
      "line-color": [
        "case",
        ["get", "included"],
        "rgba(34, 139, 34, 0.9)",
        "rgba(0, 0, 0, 0.35)",
      ],
      "line-width": 0.6,
    },
  });
}

function paintBoundary(
  map: maplibregl.Map,
  polygon: GeoJSON.Polygon | null,
  vertices: [number, number][],
): void {
  const boundarySrc = map.getSource(SRC_BOUNDARY) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (boundarySrc) {
    if (polygon) {
      boundarySrc.setData({
        type: "Feature",
        geometry: polygon,
        properties: {},
      });
    } else if (vertices.length >= 2) {
      boundarySrc.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: vertices },
        properties: {},
      });
    } else {
      boundarySrc.setData({ type: "FeatureCollection", features: [] });
    }
  }
  const verticesSrc = map.getSource(SRC_VERTICES) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (verticesSrc) {
    verticesSrc.setData({
      type: "FeatureCollection",
      features: vertices.map((v, idx) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: v },
        properties: { idx },
      })),
    });
  }
}

function paintHexes(
  map: maplibregl.Map,
  polygon: GeoJSON.Polygon | null,
  included: ReadonlySet<H3Index>,
): void {
  const src = map.getSource(SRC_HEX) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!polygon) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const candidates = new Set<H3Index>();
  const inside = cellsInPolygon(toRing(polygon), RES_PICKER);
  if (inside.length <= MAX_CANDIDATE_HEXES) {
    for (const c of inside) candidates.add(c);
  }
  for (const c of included) candidates.add(c);

  const features: GeoJSON.Feature[] = Array.from(candidates).map((h3) => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [cellRing(h3)] },
    properties: { h3, included: included.has(h3) },
  }));
  src.setData({ type: "FeatureCollection", features });
}

function isCellInsidePolygon(cell: H3Index, polygon: GeoJSON.Polygon): boolean {
  const [lng, lat] = cellCenter(cell);
  const recomputed = cellAtPoint({ lat, lng }, RES_PICKER);
  const cells = cellsInPolygon(toRing(polygon), RES_PICKER);
  return cells.includes(recomputed);
}

function toRing(polygon: GeoJSON.Polygon): [number, number][] {
  return polygon.coordinates[0].map(([lng, lat]) => [lng, lat]);
}

function ringWithoutClose(polygon: GeoJSON.Polygon): [number, number][] {
  const ring = toRing(polygon);
  if (ring.length < 2) return [];
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last[0] === first[0] && last[1] === first[1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

function closeRing(vertices: [number, number][]): [number, number][] {
  if (vertices.length < 3) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return vertices;
  return [...vertices, first];
}

function polygonCentroid(polygon: GeoJSON.Polygon): {
  lat: number;
  lng: number;
} {
  return polygonCentroidFromRing(toRing(polygon));
}

function polygonCentroidFromRing(ring: [number, number][]): {
  lat: number;
  lng: number;
} {
  // Drop the closing duplicate before averaging if present.
  const pts =
    ring.length >= 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of pts) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lng: sumLng / pts.length, lat: sumLat / pts.length };
}
