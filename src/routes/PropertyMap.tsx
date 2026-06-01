// ARB-093 + ARB-104 + ARB-107: Map view inside a selected property.
// Loads plants, renders markers, handles "tap empty cell to add" and
// "tap marker to view info".

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapView,
  type MapMarker,
  type MapViewHandle,
} from "../components/map/MapView";
import { useCurrentProperty } from "../lib/property-context";
import { api, ApiCallError, type Plant } from "../lib/api";
import {
  PlantSheet,
  type PlantSheetMode,
} from "../components/plants/PlantSheet";
import { PropertyTabs } from "../components/PropertyTabs";
import { cellAtPoint } from "../lib/h3";

export function PropertyMap() {
  const property = useCurrentProperty();
  const location = useLocation();
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: PlantSheetMode | null;
  }>({ open: false, mode: null });
  const handleRef = useRef<MapViewHandle | null>(null);

  async function reload() {
    try {
      setError(null);
      const list = await api.listPlants(property.id);
      setPlants(list);
    } catch (err) {
      setError(
        err instanceof ApiCallError ? err.message : "Failed to load plants",
      );
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  // ARB-110: when arriving with #plant=<id>, fly to it and open the info sheet.
  useEffect(() => {
    if (!plants || !location.hash.startsWith("#plant=")) return;
    const id = location.hash.slice("#plant=".length);
    const plant = plants.find((p) => p.id === id);
    if (!plant) return;
    setSheet({ open: true, mode: { kind: "info", plant } });
    handleRef.current?.flyTo({ lat: plant.lat, lng: plant.lng, zoom: 19 });
    // Strip the hash so navigating back doesn't re-trigger.
    navigate(location.pathname, { replace: true });
  }, [plants, location.hash, location.pathname, navigate]);

  const includedHexes = useMemo(() => {
    try {
      const parsed = JSON.parse(property.included_hexes);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x) => typeof x === "string"))
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [property.included_hexes]);

  const occupied = useMemo<Set<string>>(
    () => new Set(plants?.map((p) => p.h3_res15) ?? []),
    [plants],
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      (plants ?? []).map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.common_name,
      })),
    [plants],
  );

  const boundary = useMemo<GeoJSON.Polygon | null>(() => {
    if (!property.boundary_geojson) return null;
    try {
      const parsed = JSON.parse(property.boundary_geojson);
      if (parsed && parsed.type === "Polygon") return parsed as GeoJSON.Polygon;
      return null;
    } catch {
      return null;
    }
  }, [property.boundary_geojson]);

  const initial =
    property.center_lat != null && property.center_lng != null
      ? { lat: property.center_lat, lng: property.center_lng, zoom: 17 }
      : undefined;

  function handleCellTap(
    cell: string,
    point: { lat: number; lng: number },
  ): void {
    // Ignore taps outside the property's hex set — those would just fail
    // server-side validation.
    if (!includedHexes.has(cell)) return;
    setSheet({
      open: true,
      mode: {
        kind: "create",
        cell,
        lat: point.lat,
        lng: point.lng,
        propertyId: property.id,
      },
    });
  }

  function handleMarkerClick(id: string): void {
    const plant = plants?.find((p) => p.id === id);
    if (!plant) return;
    setSheet({ open: true, mode: { kind: "info", plant } });
  }

  function handleSaved(plant: Plant): void {
    // Used both as save-success and as edit-trigger from info view.
    setSheet((s) => {
      if (s.mode?.kind === "info" && s.mode.plant.id === plant.id) {
        return { open: true, mode: { kind: "edit", plant } };
      }
      return { open: false, mode: null };
    });
    void reload();
  }

  function handleDeleted(_id: string): void {
    setSheet({ open: false, mode: null });
    void reload();
  }

  function handleAddButton(): void {
    if (!property.center_lat || !property.center_lng) {
      setError(
        "This property has no centre point set yet — tap an empty cell on the map instead.",
      );
      return;
    }
    // Drop a fresh plant at the property centre's res-15 cell.
    const cell = cellAtPoint({
      lat: property.center_lat,
      lng: property.center_lng,
    });
    setSheet({
      open: true,
      mode: {
        kind: "create",
        cell,
        lat: property.center_lat,
        lng: property.center_lng,
        propertyId: property.id,
      },
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <PropertyTabs />
      {error && (
        <div className="border-b border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2">
          {error}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <MapView
          initial={initial}
          boundary={boundary}
          includedHexes={includedHexes}
          occupiedCells={occupied}
          markers={markers}
          onCellTap={handleCellTap}
          onMarkerClick={handleMarkerClick}
          handleRef={handleRef}
        />
        <button
          type="button"
          onClick={handleAddButton}
          className="absolute bottom-4 right-4 z-10 rounded-full w-12 h-12 bg-[var(--color-accent)] text-white text-2xl shadow-lg hover:opacity-90"
          aria-label="Add plant at property centre"
          title="Add plant at property centre"
        >
          +
        </button>
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 border border-black/10 rounded shadow px-3 py-1.5 text-xs">
          {plants === null
            ? "Loading plants…"
            : `${plants.length} plant${plants.length === 1 ? "" : "s"}`}
        </div>
      </div>
      <PlantSheet
        open={sheet.open}
        mode={sheet.mode}
        onClose={() => setSheet({ open: false, mode: null })}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
