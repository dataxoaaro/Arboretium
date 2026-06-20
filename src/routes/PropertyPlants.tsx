// ARB-108 + ARB-109 + ARB-110: Plants list view — sortable, filterable
// (search across common_name / latin_name / notes / source), with a
// "Show on map" action that pans the map and opens the plant.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Plant } from "../lib/api";
import { cachedRead } from "../lib/cached-read";
import { useCurrentProperty } from "../lib/property-context";
import { PropertyTabs } from "../components/PropertyTabs";
import { t } from "../lib/strings";

type SortKey = "common_name" | "plant_type" | "planted_date" | "updated_at";
type SortDir = "asc" | "desc";

export function PropertyPlants() {
  const property = useCurrentProperty();
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("common_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let cancelled = false;
    cachedRead(`plants:${property.id}`, () => api.listPlants(property.id))
      .then((r) => {
        if (!cancelled) setPlants(r.data);
      })
      .catch(() => {
        if (!cancelled) setError(t.mapLoadPlantsFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [property.id]);

  const filtered = useMemo(() => {
    if (!plants) return null;
    const q = search.trim().toLowerCase();
    let rows = plants;
    if (q) {
      rows = rows.filter((p) => {
        return (
          p.common_name.toLowerCase().includes(q) ||
          (p.latin_name?.toLowerCase().includes(q) ?? false) ||
          (p.notes?.toLowerCase().includes(q) ?? false) ||
          (p.source?.toLowerCase().includes(q) ?? false)
        );
      });
    }
    rows = [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [plants, search, sortKey, sortDir]);

  const speciesCount = useMemo(() => {
    if (!plants) return 0;
    const set = new Set<string>();
    for (const p of plants) {
      const key = (p.latin_name ?? p.common_name).toLowerCase().trim();
      if (key) set.add(key);
    }
    return set.size;
  }, [plants]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function showOnMap(plant: Plant) {
    // Pass the plant id via the URL hash so PropertyMap can flyTo + open it.
    navigate(`/properties/${property.id}#plant=${plant.id}`);
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <PropertyTabs />
      <div className="flex-1 overflow-y-auto p-4 max-w-5xl w-full mx-auto">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
          <h1 className="text-xl font-semibold">
            {t.plantsHeading(property.name)}
          </h1>
          {plants && (
            <p className="text-sm text-muted">
              {t.plantsSummary(plants.length, speciesCount)}
            </p>
          )}
        </header>

        {error && (
          <div className="mb-4 border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-xl px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.plantsSearchPlaceholder}
            className="w-full sm:max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </div>

        {plants === null && <p className="text-sm text-muted">{t.loading}</p>}

        {plants && plants.length === 0 && (
          <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-6 text-sm text-muted">
            {t.plantsEmpty}
          </div>
        )}

        {filtered && plants && plants.length > 0 && (
          <div className="overflow-x-auto border border-black/10 rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.03] text-left text-xs uppercase text-fg/60">
                <tr>
                  <Th
                    onClick={() => toggleSort("common_name")}
                    active={sortKey === "common_name"}
                    dir={sortDir}
                  >
                    {t.colName}
                  </Th>
                  <Th
                    onClick={() => toggleSort("plant_type")}
                    active={sortKey === "plant_type"}
                    dir={sortDir}
                  >
                    {t.colType}
                  </Th>
                  <Th
                    onClick={() => toggleSort("planted_date")}
                    active={sortKey === "planted_date"}
                    dir={sortDir}
                  >
                    {t.colPlanted}
                  </Th>
                  <Th
                    onClick={() => toggleSort("updated_at")}
                    active={sortKey === "updated_at"}
                    dir={sortDir}
                  >
                    {t.colUpdated}
                  </Th>
                  <th className="px-3 py-2 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-fg/60 text-xs"
                    >
                      {t.plantsNoMatch(search)}
                    </td>
                  </tr>
                )}
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-black/5">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.common_name}</div>
                      {p.latin_name && (
                        <div className="text-[11px] italic text-fg/60">
                          {p.latin_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.plant_type ?? "—"}</td>
                    <td className="px-3 py-2">{p.planted_date ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-fg/70">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => showOnMap(p)}
                        className="text-xs underline text-fg/80 hover:text-fg"
                      >
                        {t.showOnMap}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function sortValue(p: Plant, key: SortKey): string | number {
  switch (key) {
    case "common_name":
      return p.common_name.toLowerCase();
    case "plant_type":
      return (p.plant_type ?? "").toLowerCase();
    case "planted_date":
      return p.planted_date ?? "";
    case "updated_at":
      return p.updated_at;
  }
}

function Th({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 ${active ? "text-fg" : ""}`}
      >
        {children}
        {active && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
