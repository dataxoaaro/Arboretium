// ARB-093 + ARB-104 + ARB-107 + ARB-142/146: Map view inside a property.
// Tapping a hex opens the CellSheet (plants + notes + photos for that spot);
// from there you can open a plant or add one. Tapping a plant marker jumps
// straight to that plant. Annotated cells (notes/photos, no plant) show as
// amber on the map.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapView,
  type MapMarker,
  type MapViewHandle,
} from "../components/map/MapView";
import { useCurrentProperty } from "../lib/property-context";
import { api, type CellSummary, type Plant } from "../lib/api";
import { t } from "../lib/strings";
import {
  PlantSheet,
  type PlantSheetMode,
} from "../components/plants/PlantSheet";
import { CellSheet } from "../components/cells/CellSheet";
import { PropertyTabs } from "../components/PropertyTabs";
import { cellAtPoint, cellCenter } from "../lib/h3";
import { cachedRead } from "../lib/cached-read";

type SheetState =
  | { kind: "none" }
  | { kind: "plant"; mode: PlantSheetMode }
  | { kind: "cell"; h3: string };

export function PropertyMap() {
  const property = useCurrentProperty();
  const location = useLocation();
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [cells, setCells] = useState<CellSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const handleRef = useRef<MapViewHandle | null>(null);

  const reloadPlants = useCallback(async () => {
    try {
      setError(null);
      const r = await cachedRead(`plants:${property.id}`, () =>
        api.listPlants(property.id),
      );
      setPlants(r.data);
    } catch {
      setError(t.mapLoadPlantsFailed);
    }
  }, [property.id]);

  const reloadCells = useCallback(async () => {
    try {
      const r = await cachedRead(`cells:${property.id}`, () =>
        api.listCells(property.id),
      );
      setCells(r.data);
    } catch {
      // The annotated overlay is non-critical; ignore load errors.
    }
  }, [property.id]);

  useEffect(() => {
    void reloadPlants();
    void reloadCells();
  }, [reloadPlants, reloadCells]);

  // ARB-110: arriving with #plant=<id> flies to it and opens its detail.
  useEffect(() => {
    if (!plants || !location.hash.startsWith("#plant=")) return;
    const id = location.hash.slice("#plant=".length);
    const plant = plants.find((p) => p.id === id);
    if (!plant) return;
    setSheet({ kind: "plant", mode: { kind: "info", plant } });
    handleRef.current?.flyTo({ lat: plant.lat, lng: plant.lng, zoom: 19 });
    navigate(location.pathname, { replace: true });
  }, [plants, location.hash, location.pathname, navigate]);

  const includedHexes = useMemo(() => {
    try {
      const parsed = JSON.parse(property.included_hexes);
      return Array.isArray(parsed)
        ? new Set<string>(parsed.filter((x) => typeof x === "string"))
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [property.included_hexes]);

  const occupied = useMemo<Set<string>>(
    () => new Set(plants?.map((p) => p.h3_res15) ?? []),
    [plants],
  );

  // Annotated = has notes/photos but no plant (a planted cell reads as planted).
  const annotated = useMemo<Set<string>>(
    () =>
      new Set(cells.map((c) => c.h3_res15).filter((h3) => !occupied.has(h3))),
    [cells, occupied],
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
      return parsed?.type === "Polygon" ? (parsed as GeoJSON.Polygon) : null;
    } catch {
      return null;
    }
  }, [property.boundary_geojson]);

  const initial =
    property.center_lat != null && property.center_lng != null
      ? { lat: property.center_lat, lng: property.center_lng, zoom: 17 }
      : undefined;

  function handleCellTap(cell: string): void {
    // Taps outside the property would just fail server-side; ignore them.
    if (!includedHexes.has(cell)) return;
    setSheet({ kind: "cell", h3: cell });
  }

  function handleMarkerClick(id: string): void {
    const plant = plants?.find((p) => p.id === id);
    if (plant) setSheet({ kind: "plant", mode: { kind: "info", plant } });
  }

  function openCreateAt(cell: string): void {
    const [lng, lat] = cellCenter(cell);
    setSheet({
      kind: "plant",
      mode: { kind: "create", cell, lat, lng, propertyId: property.id },
    });
  }

  function handlePlantSaved(plant: Plant): void {
    setSheet((s) => {
      if (
        s.kind === "plant" &&
        s.mode.kind === "info" &&
        s.mode.plant.id === plant.id
      ) {
        return { kind: "plant", mode: { kind: "edit", plant } };
      }
      return { kind: "none" };
    });
    void reloadPlants();
    void reloadCells();
  }

  function handlePlantDeleted(): void {
    setSheet({ kind: "none" });
    void reloadPlants();
    void reloadCells();
  }

  function handleAddButton(): void {
    if (property.center_lat == null || property.center_lng == null) {
      setError(t.mapNoCentre);
      return;
    }
    openCreateAt(
      cellAtPoint({ lat: property.center_lat, lng: property.center_lng }),
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <PropertyTabs />
      {error && (
        <div className="border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] px-4 py-2">
          {error}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <MapView
          initial={initial}
          boundary={boundary}
          includedHexes={includedHexes}
          occupiedCells={occupied}
          annotatedCells={annotated}
          markers={markers}
          onCellTap={handleCellTap}
          onMarkerClick={handleMarkerClick}
          handleRef={handleRef}
        />
        <button
          type="button"
          onClick={handleAddButton}
          className="absolute bottom-5 right-5 z-10 rounded-full w-16 h-16 bg-[var(--color-accent)] text-white text-3xl shadow-lg hover:bg-[var(--color-accent-strong)] inline-flex items-center justify-center"
          aria-label={t.mapAddPlant}
        >
          +
        </button>
        <div className="absolute bottom-5 left-5 z-10 bg-[var(--color-surface)]/95 border border-[var(--color-border)] rounded-xl shadow px-3 py-2 text-sm font-medium">
          {plants === null ? t.loading : t.mapPlants(plants.length)}
        </div>
      </div>

      <PlantSheet
        open={sheet.kind === "plant"}
        mode={sheet.kind === "plant" ? sheet.mode : null}
        onClose={() => setSheet({ kind: "none" })}
        onSaved={handlePlantSaved}
        onDeleted={handlePlantDeleted}
      />
      <CellSheet
        open={sheet.kind === "cell"}
        propertyId={sheet.kind === "cell" ? property.id : null}
        h3={sheet.kind === "cell" ? sheet.h3 : null}
        onClose={() => setSheet({ kind: "none" })}
        onOpenPlant={(plant) =>
          setSheet({ kind: "plant", mode: { kind: "info", plant } })
        }
        onAddPlant={(h3) => openCreateAt(h3)}
        onChanged={() => void reloadCells()}
      />
    </div>
  );
}
