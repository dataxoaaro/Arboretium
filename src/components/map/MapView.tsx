// MapLibre wrapper for the property map view.
//
// Renders:
//   - basemap (3-way toggle: Street / Sat MML / Sat Esri — same as AdminMap)
//   - property boundary outline
//   - hexes restricted to the property's included_hexes (no "full" mode —
//     we never draw hexes outside the property's boundary)
//   - GPS dot + accuracy circle
//   - plant markers + labels
//
// The basemap-swap pattern matches AdminMap: a separate effect mutates the
// map source/layer in place and never updates the React `config` state, so
// the map (and all overlays) survive a basemap change.

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  fetchMapConfig,
  type BasemapLayer,
  type MapConfig,
} from "../../lib/api-map";
import {
  cellAtPoint,
  cellRing,
  cellCenter,
  RES_FINE,
  type H3Index,
} from "../../lib/h3";
import { readHexMode, writeHexMode } from "./visibility-mode";
import { BasemapToggle } from "./BasemapToggle";
import { t } from "../../lib/strings";

const SRC_BASEMAP = "basemap";
const LAYER_BASEMAP = "basemap";
const HEX_FILL_LAYER = "arb-hex-fill";
const HEX_LINE_LAYER = "arb-hex-line";
const HEX_SOURCE = "arb-hex";
const BOUNDARY_LAYER = "arb-boundary";
const BOUNDARY_SOURCE = "arb-boundary";
const GPS_LAYER = "arb-gps";
const GPS_ACCURACY_LAYER = "arb-gps-accuracy";
const GPS_SOURCE = "arb-gps";
const MARKER_LAYER = "arb-markers";
const MARKER_LABEL_LAYER = "arb-markers-label";
const MARKER_SOURCE = "arb-markers";
const ANNOTATED_LAYER = "arb-annotated";
const ANNOTATED_SOURCE = "arb-annotated";

// Map palette — mirrors the DESIGN.md tokens (green = planted, amber = notes/
// photos only). Kept as literals because the MapLibre style runs outside the
// CSS cascade.
const COLOR_PLANTED = "#3f7d44";
const COLOR_ANNOTATED = "#c98a2b";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface MapViewHandle {
  /** Imperatively pan/zoom the map. Used by the list view's "Show on map". */
  flyTo(opts: { lat: number; lng: number; zoom?: number }): void;
}

interface MapViewProps {
  /** Initial centre and zoom; defaults to a roughly Finland-wide view. */
  initial?: { lng: number; lat: number; zoom: number };
  /** Optional GeoJSON polygon to outline as the property boundary. */
  boundary?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  /** Property's res-15 cell set — the only cells we ever draw as hexes. */
  includedHexes?: ReadonlySet<H3Index>;
  /** Subset of includedHexes that already have plants — rendered green. */
  occupiedCells?: ReadonlySet<H3Index>;
  /** Cells with notes/photos but no plants — rendered amber (ARB-146). */
  annotatedCells?: ReadonlySet<H3Index>;
  /** Called when the user taps a cell. */
  onCellTap?: (h3: H3Index, point: { lat: number; lng: number }) => void;
  /** Plant markers to render. */
  markers?: ReadonlyArray<MapMarker>;
  /** Called when the user taps a marker. Receives the marker id. */
  onMarkerClick?: (id: string) => void;
  /** Imperative handle setter (parent can flyTo etc.). */
  handleRef?: React.MutableRefObject<MapViewHandle | null>;
}

export function MapView({
  initial,
  boundary,
  includedHexes,
  occupiedCells,
  annotatedCells,
  onCellTap,
  markers,
  onMarkerClick,
  handleRef,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Default to MML satellite — same as AdminMap.
  const [basemap, setBasemap] = useState<BasemapLayer>("satellite-mml");
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerFellBack, setProviderFellBack] = useState(false);
  const [hexMode, setHexMode] = useState<"off" | "on">(() => readHexMode());
  const [gps, setGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  // Use a ref so the map's MARKER_LAYER click handler always sees the latest
  // callback without rebinding on every parent render.
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  // --- initial config fetch (once) ---
  useEffect(() => {
    fetchMapConfig(basemap)
      .then((cfg) => {
        setConfig(cfg);
        setProviderFellBack(!!cfg.fellBack);
      })
      .catch((err: Error) => setError(err.message));
    // Subsequent basemap changes are handled by the swap effect below so
    // the map (and overlays / camera) survive the change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- map init (one-shot, keyed on first config) ---
  useEffect(() => {
    if (!config || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
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
      center: initial ? [initial.lng, initial.lat] : [25.7, 62.0],
      zoom: initial?.zoom ?? 5,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }));
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showAccuracyCircle: false, // we draw our own
      }),
    );

    map.on("load", () => {
      map.addSource(HEX_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: HEX_FILL_LAYER,
        type: "fill",
        source: HEX_SOURCE,
        // Tiny at low zoom; only paint from z=17 to keep the map readable
        // when zoomed out.
        minzoom: 17,
        paint: {
          "fill-color": [
            "match",
            ["get", "state"],
            "planted",
            "rgba(63, 125, 68, 0.32)",
            "annotated",
            "rgba(201, 138, 43, 0.32)",
            /* empty */ "rgba(0, 0, 0, 0.04)",
          ],
        },
      });
      map.addLayer({
        id: HEX_LINE_LAYER,
        type: "line",
        source: HEX_SOURCE,
        minzoom: 17,
        paint: {
          "line-color": [
            "match",
            ["get", "state"],
            "planted",
            "rgba(63, 125, 68, 0.9)",
            "annotated",
            "rgba(201, 138, 43, 0.95)",
            /* empty */ "rgba(0, 0, 0, 0.35)",
          ],
          "line-width": 0.6,
        },
      });

      map.addSource(BOUNDARY_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: BOUNDARY_LAYER,
        type: "line",
        source: BOUNDARY_SOURCE,
        paint: { "line-color": "#1f6feb", "line-width": 2.5 },
      });

      map.addSource(GPS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: GPS_ACCURACY_LAYER,
        type: "circle",
        source: GPS_SOURCE,
        filter: ["==", ["get", "kind"], "accuracy"],
        paint: {
          "circle-radius": ["get", "radiusPx"],
          "circle-color": "rgba(31, 111, 235, 0.15)",
          "circle-stroke-color": "rgba(31, 111, 235, 0.4)",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: GPS_LAYER,
        type: "circle",
        source: GPS_SOURCE,
        filter: ["==", ["get", "kind"], "dot"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#1f6feb",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });

      // Annotated cells (notes/photos, no plant): amber dots, drawn beneath
      // the green plant markers so a planted cell always reads as planted.
      map.addSource(ANNOTATED_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ANNOTATED_LAYER,
        type: "circle",
        source: ANNOTATED_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": COLOR_ANNOTATED,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });

      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: MARKER_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        paint: {
          "circle-radius": 7,
          "circle-color": COLOR_PLANTED,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: MARKER_LABEL_LAYER,
        type: "symbol",
        source: MARKER_SOURCE,
        minzoom: 16,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#1a3d1a",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.2,
        },
      });
    });

    // Marker hits take precedence over cell taps.
    map.on("click", MARKER_LAYER, (e) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id === "string") {
        onMarkerClickRef.current?.(id);
        e.preventDefault();
      }
    });
    map.on("mouseenter", MARKER_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", MARKER_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", (e) => {
      // If a marker handler already consumed this click, skip the cell tap.
      if (e.defaultPrevented) return;
      const h3 = cellAtPoint(
        { lat: e.lngLat.lat, lng: e.lngLat.lng },
        RES_FINE,
      );
      onCellTap?.(h3, { lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // initial.* / onCellTap intentionally not deps — initialisation is one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // --- basemap swap (mutates map; never updates React state — see AdminMap) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    let cancelled = false;
    fetchMapConfig(basemap)
      .then((cfg) => {
        if (cancelled) return;
        setProviderFellBack(!!cfg.fellBack);
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
        // Insert before the first overlay layer so basemap renders underneath.
        const beforeId = map.getLayer(HEX_FILL_LAYER)
          ? HEX_FILL_LAYER
          : undefined;
        map.addLayer(
          { id: LAYER_BASEMAP, type: "raster", source: SRC_BASEMAP },
          beforeId,
        );
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [basemap]);

  // Watch GPS.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Push hex grid whenever mode / included / occupied changes. We never paint
  // hexes outside the property — when there's no included set or mode is off,
  // the source is cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    drawHexes(
      map,
      hexMode,
      includedHexes,
      occupiedCells ?? new Set(),
      annotatedCells ?? new Set(),
    );
  }, [hexMode, includedHexes, occupiedCells, annotatedCells, config]);

  // Push annotated-cell markers (amber dots at each cell centre).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource(ANNOTATED_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [];
    for (const h3 of annotatedCells ?? []) {
      try {
        const [lng, lat] = cellCenter(h3);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: { h3 },
        });
      } catch {
        // skip malformed cell ids
      }
    }
    src.setData({ type: "FeatureCollection", features });
  }, [annotatedCells, config]);

  // Push boundary.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource(BOUNDARY_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    if (boundary) {
      src.setData({ type: "Feature", geometry: boundary, properties: {} });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [boundary, config]);

  // Push markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource(MARKER_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    const list = markers ?? [];
    src.setData({
      type: "FeatureCollection",
      features: list.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: { id: m.id, label: m.label },
      })),
    });
  }, [markers, config]);

  // Expose imperative handle.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      flyTo({ lat, lng, zoom }) {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
          center: [lng, lat],
          zoom: zoom ?? Math.max(map.getZoom(), 18),
          duration: 600,
        });
      },
    };
    return () => {
      if (handleRef) handleRef.current = null;
    };
  }, [handleRef, config]);

  // Push GPS dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !gps) return;
    const src = map.getSource(GPS_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    const radiusPx = accuracyToPixels(map, gps.lat, gps.accuracy);
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [gps.lng, gps.lat] },
          properties: { kind: "dot" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [gps.lng, gps.lat] },
          properties: { kind: "accuracy", radiusPx },
        },
      ],
    });
  }, [gps, config]);

  function changeHexMode(next: "off" | "on") {
    setHexMode(next);
    writeHexMode(next);
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {error && (
        <div className="absolute top-2 left-2 right-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm rounded shadow">
          {error}
        </div>
      )}
      {/* Toolbar lives top-LEFT to avoid colliding with MapLibre's nav +
          geolocate controls (top-right by default). */}
      <div className="absolute top-2 left-2 flex flex-col gap-2 max-w-[calc(100%-1rem)]">
        <BasemapToggle
          value={basemap}
          onChange={setBasemap}
          fellBack={providerFellBack}
        />
        <div className="bg-white/95 border border-black/10 rounded shadow flex text-xs self-start">
          <button
            type="button"
            onClick={() => changeHexMode("off")}
            className={`min-h-11 px-4 ${
              hexMode === "off" ? "bg-black/10 font-medium" : "hover:bg-black/5"
            }`}
          >
            {t.hexesOff}
          </button>
          <button
            type="button"
            onClick={() => changeHexMode("on")}
            className={`min-h-11 px-4 ${
              hexMode === "on" ? "bg-black/10 font-medium" : "hover:bg-black/5"
            }`}
          >
            {t.hexesOn}
          </button>
        </div>
      </div>
    </div>
  );
}

function drawHexes(
  map: maplibregl.Map,
  mode: "off" | "on",
  included: ReadonlySet<H3Index> | undefined,
  occupied: ReadonlySet<H3Index>,
  annotated: ReadonlySet<H3Index>,
): void {
  const src = map.getSource(HEX_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  if (mode === "off" || !included || included.size === 0) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const features: GeoJSON.Feature[] = [];
  for (const h3 of included) {
    // Planted wins over annotated: a cell with a plant always reads as planted.
    const state = occupied.has(h3)
      ? "planted"
      : annotated.has(h3)
        ? "annotated"
        : "empty";
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cellRing(h3)] },
      properties: { h3, state },
    });
  }
  src.setData({ type: "FeatureCollection", features });
}

function accuracyToPixels(
  map: maplibregl.Map,
  lat: number,
  metres: number,
): number {
  // Web Mercator approximation: metres-per-pixel at given lat & zoom.
  const zoom = map.getZoom();
  const mPerPx =
    (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return Math.max(4, Math.min(metres / mPerPx, 200));
}
