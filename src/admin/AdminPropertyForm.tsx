// ARB-053 + ARB-054: Property create + edit form. Mounted at:
//   /admin/properties/new
//   /admin/properties/:id/edit
//
// No owner/membership: any signed-in user can create and edit any property.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi, AdminApiError } from "./admin-api";
import type { PropertyRow } from "./admin-types";
import { AdminMap, type BoundaryShape } from "./AdminMap";
import { t } from "../lib/strings";

interface AdminPropertyFormProps {
  mode: "create" | "edit";
}

export function AdminPropertyForm({ mode }: AdminPropertyFormProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const propertyId = mode === "edit" ? (params.id ?? null) : null;

  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [name, setName] = useState("");
  const [shape, setShape] = useState<BoundaryShape>({
    polygon: null,
    includedHexes: [],
    center: null,
  });
  // Captured once when the property loads so AdminMap's `initial` prop is stable
  // for its lifetime (the component is keyed by propertyId so it remounts on
  // route change anyway).
  const [initialShape, setInitialShape] = useState<BoundaryShape>({
    polygon: null,
    includedHexes: [],
    center: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (mode === "edit" && propertyId) {
          const all = await adminApi.listProperties();
          if (cancelled) return;
          const p = all.find((row) => row.id === propertyId) ?? null;
          if (!p) throw new AdminApiError("Property not found", 404);
          setProperty(p);
          setName(p.name);
          const parsed = parseShape(p);
          setShape(parsed);
          setInitialShape(parsed);
        }
        setLoaded(true);
      } catch {
        setError(t.failedToLoad);
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, propertyId]);

  const onShapeChange = useCallback((next: BoundaryShape) => {
    setShape(next);
  }, []);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError(t.adminNameRequired);
      return;
    }
    if (!shape.polygon) {
      setError(t.adminDrawBoundary);
      return;
    }
    if (shape.includedHexes.length === 0) {
      setError(t.adminIncludeHex);
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await adminApi.createProperty({
          name: name.trim(),
          boundary_geojson: JSON.stringify(shape.polygon),
          included_hexes: JSON.stringify(shape.includedHexes),
          center_lat: shape.center?.lat ?? null,
          center_lng: shape.center?.lng ?? null,
        });
        navigate(`/admin/properties/${created.id}/edit`, { replace: true });
      } else if (propertyId) {
        await adminApi.updateProperty(propertyId, {
          name: name.trim(),
          boundary_geojson: JSON.stringify(shape.polygon),
          included_hexes: JSON.stringify(shape.includedHexes),
          center_lat: shape.center?.lat ?? null,
          center_lng: shape.center?.lng ?? null,
        });
        navigate("/admin/properties");
      }
    } catch {
      setError(t.adminFormSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="p-6 text-sm text-fg/60">{t.loading}</div>;
  }

  return (
    <div className="p-6 max-w-6xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">
          {mode === "create"
            ? t.adminNewProperty
            : t.adminFormEditTitle(property?.name)}
        </h1>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate("/admin/properties")}
            className="px-3 py-2 rounded-md bg-black/5 hover:bg-black/10"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-3 py-2 rounded-md bg-fg text-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-3">
          <Field label={t.adminFieldName}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-black/15 rounded-md px-2 py-1.5 text-sm"
              placeholder={t.adminNamePlaceholder}
            />
          </Field>
          <div className="border border-black/10 rounded-md p-3 text-xs text-fg/70 space-y-1">
            <p>
              <strong>{t.adminBoundaryLabel}</strong>{" "}
              {shape.polygon ? t.adminBoundaryDrawn : t.adminBoundaryNotDrawn}
            </p>
            <p>
              <strong>{t.adminHexesLabel}</strong>{" "}
              {shape.includedHexes.length.toLocaleString()} · taso 15
            </p>
            {shape.center && (
              <p>
                <strong>{t.adminCentreLabel}</strong>{" "}
                {shape.center.lat.toFixed(5)}, {shape.center.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>

        <div className="h-[600px] border border-black/10 rounded-md overflow-hidden">
          <AdminMap
            key={propertyId ?? "new"}
            initial={initialShape}
            initialView={
              property?.center_lat != null && property?.center_lng != null
                ? {
                    lat: property.center_lat,
                    lng: property.center_lng,
                    zoom: 18,
                  }
                : undefined
            }
            onChange={onShapeChange}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-fg/70 mb-1">{label}</div>
      {children}
    </label>
  );
}

function parseShape(p: PropertyRow): BoundaryShape {
  let polygon: GeoJSON.Polygon | null = null;
  if (p.boundary_geojson) {
    try {
      const parsed = JSON.parse(p.boundary_geojson);
      if (parsed && parsed.type === "Polygon") {
        polygon = parsed as GeoJSON.Polygon;
      }
    } catch {
      polygon = null;
    }
  }
  let hexes: string[] = [];
  try {
    const parsed = JSON.parse(p.included_hexes);
    if (Array.isArray(parsed))
      hexes = parsed.filter((x) => typeof x === "string");
  } catch {
    hexes = [];
  }
  return {
    polygon,
    includedHexes: hexes,
    center:
      p.center_lat != null && p.center_lng != null
        ? { lat: p.center_lat, lng: p.center_lng }
        : null,
  };
}
