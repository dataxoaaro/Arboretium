// ARB-053 + ARB-054: Property create + edit form. Edit mode also shows the
// per-property member admin (ARB-059). Mounted at:
//   /admin/properties/new
//   /admin/properties/:id/edit

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi, AdminApiError } from "./admin-api";
import type { PropertyMember, PropertyRow, UserRow } from "./admin-types";
import { AdminMap, type BoundaryShape } from "./AdminMap";

interface AdminPropertyFormProps {
  mode: "create" | "edit";
}

export function AdminPropertyForm({ mode }: AdminPropertyFormProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const propertyId = mode === "edit" ? (params.id ?? null) : null;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
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
        const list = await adminApi.listUsers();
        if (cancelled) return;
        setUsers(list);

        if (mode === "edit" && propertyId) {
          const all = await adminApi.listProperties();
          if (cancelled) return;
          const p = all.find((row) => row.id === propertyId) ?? null;
          if (!p) throw new AdminApiError("Property not found", 404);
          setProperty(p);
          setName(p.name);
          setOwnerId(p.owner_id);
          const parsed = parseShape(p);
          setShape(parsed);
          setInitialShape(parsed);
        } else if (list.length > 0) {
          setOwnerId(list[0].id);
        }
        setLoaded(true);
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load");
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
      setError("Name is required");
      return;
    }
    if (mode === "create" && !ownerId) {
      setError("Pick an owner");
      return;
    }
    if (!shape.polygon) {
      setError("Draw the property boundary first");
      return;
    }
    if (shape.includedHexes.length === 0) {
      setError("Include at least one hex");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await adminApi.createProperty({
          owner_id: ownerId,
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
          owner_id: ownerId,
          boundary_geojson: JSON.stringify(shape.polygon),
          included_hexes: JSON.stringify(shape.includedHexes),
          center_lat: shape.center?.lat ?? null,
          center_lng: shape.center?.lng ?? null,
        });
        navigate("/admin/properties");
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="p-6 text-sm text-fg/60">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-6xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">
          {mode === "create" ? "New property" : `Edit · ${property?.name}`}
        </h1>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate("/admin/properties")}
            className="px-3 py-2 rounded-md bg-black/5 hover:bg-black/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-3 py-2 rounded-md bg-fg text-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
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
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-black/15 rounded-md px-2 py-1.5 text-sm"
              placeholder="e.g. Tampere garden"
            />
          </Field>
          <Field label="Owner">
            {users.length === 0 ? (
              <p className="text-xs text-red-700">
                No users registered yet. Register one in the SPA first.
              </p>
            ) : (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full border border-black/15 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} ({u.email})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="border border-black/10 rounded-md p-3 text-xs text-fg/70 space-y-1">
            <p>
              <strong>Boundary:</strong>{" "}
              {shape.polygon ? "drawn" : "not yet drawn"}
            </p>
            <p>
              <strong>Hexes:</strong>{" "}
              {shape.includedHexes.length.toLocaleString()} · res 15
            </p>
            {shape.center && (
              <p>
                <strong>Centre:</strong> {shape.center.lat.toFixed(5)},{" "}
                {shape.center.lng.toFixed(5)}
              </p>
            )}
          </div>

          {mode === "edit" && propertyId && (
            <MembersPanel propertyId={propertyId} ownerId={ownerId} />
          )}
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

// --- ARB-059: per-property members admin ---

function MembersPanel({
  propertyId,
  ownerId,
}: {
  propertyId: string;
  ownerId: string;
}) {
  const [members, setMembers] = useState<PropertyMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setError(null);
      setMembers(await adminApi.listMembers(propertyId));
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load members",
      );
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await adminApi.addMember(propertyId, {
        email: email.trim(),
        added_by: ownerId,
      });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string, displayName: string) {
    if (!confirm(`Remove ${displayName} from this property?`)) return;
    setBusy(true);
    try {
      await adminApi.removeMember(propertyId, userId);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-black/10 rounded-md p-3">
      <h3 className="text-sm font-medium mb-2">Members</h3>
      {error && <div className="mb-2 text-xs text-red-700">{error}</div>}
      <form onSubmit={add} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="flex-1 min-w-0 border border-black/15 rounded-md px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="px-2 py-1.5 rounded-md bg-fg text-bg text-xs hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {members === null && <p className="text-xs text-fg/60">Loading…</p>}
      {members && members.length === 0 && (
        <p className="text-xs text-fg/60">No members yet.</p>
      )}
      {members && members.length > 0 && (
        <ul className="space-y-1">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 text-xs border-t border-black/5 pt-1.5"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{m.display_name}</div>
                <div className="text-fg/60 truncate">{m.email}</div>
              </div>
              {m.id === ownerId ? (
                <span className="text-[10px] uppercase text-fg/50">owner</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(m.id, m.display_name)}
                  className="text-red-700 hover:text-red-900 underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
