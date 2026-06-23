// Admin: archived (soft-deleted) items, with a Restore action. Deleting an item
// in the app keeps its row + photos; this page brings it back to the map.

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "./admin-api";
import type { PlantRow } from "./admin-types";
import { categoryOf } from "../lib/categories";
import { t } from "../lib/strings";

export function AdminArchived() {
  const [items, setItems] = useState<PlantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await adminApi.listArchivedPlants());
    } catch {
      setError(t.adminArchivedLoadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: string) {
    setBusyId(id);
    try {
      await adminApi.restorePlant(id);
      await load();
    } catch {
      setError(t.adminArchivedRestoreFailed);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold">{t.adminArchivedTitle}</h1>
      <p className="text-sm text-fg/60 mt-1 mb-4">{t.adminArchivedHint}</p>

      {error && (
        <div className="mb-4 border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {items === null && !error && <p className="text-fg/60">{t.loading}</p>}
      {items && items.length === 0 && (
        <p className="text-fg/60">{t.adminArchivedEmpty}</p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((p) => {
            const cat = categoryOf(p.category);
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 border border-black/10 rounded-lg px-3 py-2"
              >
                <span aria-hidden className="text-lg">
                  {cat.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">
                    {p.common_name}
                  </span>
                  <span className="block text-xs text-fg/50 truncate">
                    {cat.label} · {new Date(p.updated_at).toLocaleString()}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void restore(p.id)}
                  disabled={busyId === p.id}
                  className="min-h-10 px-3 rounded-md border border-black/15 hover:bg-black/5 text-sm disabled:opacity-50"
                >
                  {t.adminArchivedRestore}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
