// ARB-091 + ARB-092: Property picker. Default route after login. Lists the
// user's active properties; empty state explains that an admin needs to add
// them. Navigates to /properties/:id on selection.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Property } from "../lib/api";
import { cachedRead } from "../lib/cached-read";
import { t } from "../lib/strings";

export function Properties() {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedRead("properties", () => api.listProperties())
      .then((r) => {
        if (!cancelled) setProperties(r.data);
      })
      .catch(() => {
        if (!cancelled) setError(t.failedToLoad);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-4 font-[family-name:var(--font-display)]">
        {t.propertiesTitle}
      </h1>

      {error && (
        <div className="mb-4 border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-xl px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {properties === null && <p className="text-sm text-muted">{t.loading}</p>}

      {properties && properties.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-6 text-muted">
          <p className="font-medium text-fg mb-1">{t.propertiesEmptyTitle}</p>
          <p>{t.propertiesEmptyBody}</p>
        </div>
      )}

      {properties && properties.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {properties.map((p) => (
            <li key={p.id}>
              <Link
                to={`/properties/${p.id}`}
                className="block border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-black/[0.03] rounded-2xl p-5 transition-colors"
              >
                <div className="text-lg font-medium">{p.name}</div>
                <div className="text-sm text-muted mt-1">
                  {t.hexes(hexCount(p.included_hexes))} ·{" "}
                  {p.center_lat != null && p.center_lng != null
                    ? `${p.center_lat.toFixed(3)}, ${p.center_lng.toFixed(3)}`
                    : t.noCentre}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function hexCount(json: string): number {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}
