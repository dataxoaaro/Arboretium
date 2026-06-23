// ARB-108 + ARB-109 + ARB-110: Plants list view — sortable, filterable
// (search across common_name / latin_name / notes / source), with a
// "Show on map" action that pans the map and opens the plant.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Plant } from "../lib/api";
import { cachedRead } from "../lib/cached-read";
import { useCurrentProperty } from "../lib/property-context";
import { PropertyTabs } from "../components/PropertyTabs";
import {
  CATEGORIES,
  categoryOf,
  resolveItemColor,
  type CategoryKey,
} from "../lib/categories";
import { t } from "../lib/strings";

type SortKey = "common_name" | "plant_type" | "planted_date" | "updated_at";
type SortDir = "asc" | "desc";
type CategoryFilter = CategoryKey | "all";

export function PropertyPlants() {
  const property = useCurrentProperty();
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
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
    if (categoryFilter !== "all") {
      rows = rows.filter((p) => categoryOf(p.category).key === categoryFilter);
    }
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
  }, [plants, search, categoryFilter, sortKey, sortDir]);

  // Per-category counts for the filter chips.
  const counts = useMemo(() => {
    const m = new Map<CategoryKey, number>();
    for (const c of CATEGORIES) m.set(c.key, 0);
    for (const p of plants ?? []) {
      const k = categoryOf(p.category).key;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
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
              {t.plantsSummary(plants.length)}
            </p>
          )}
        </header>

        {plants && plants.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <FilterChip
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            >
              {t.filterAll} ({plants.length})
            </FilterChip>
            {CATEGORIES.map((c) => (
              <FilterChip
                key={c.key}
                active={categoryFilter === c.key}
                color={c.color}
                onClick={() => setCategoryFilter(c.key)}
              >
                <span aria-hidden>{c.icon}</span> {c.label} (
                {counts.get(c.key) ?? 0})
              </FilterChip>
            ))}
          </div>
        )}

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
                      <div className="font-medium flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: resolveItemColor(
                              p.category,
                              p.color,
                            ),
                          }}
                          aria-hidden
                        />
                        <span aria-hidden>{categoryOf(p.category).icon}</span>
                        <span className="truncate">{p.common_name}</span>
                      </div>
                      {p.latin_name && (
                        <div className="text-[11px] italic text-fg/60 pl-[1.6rem]">
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

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 px-3 rounded-full border text-sm inline-flex items-center gap-1.5 ${
        active
          ? "border-[var(--color-accent)] bg-black/[0.05] font-medium"
          : "border-[var(--color-border)] hover:bg-black/[0.03]"
      }`}
    >
      {color && (
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {children}
    </button>
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
