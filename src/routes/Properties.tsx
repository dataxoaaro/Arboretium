// ARB-091 + ARB-092: Property picker. Default route after login. Lists the
// user's active properties; empty state explains that an admin needs to add
// them. Navigates to /properties/:id on selection.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiCallError, type Property } from "../lib/api";
import { cachedRead } from "../lib/cached-read";

export function Properties() {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedRead("properties", () => api.listProperties())
      .then((r) => {
        if (!cancelled) setProperties(r.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiCallError ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-4 font-[family-name:var(--font-display)]">
        Pick a property
      </h1>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {properties === null && <p className="text-sm text-fg/60">Loading…</p>}

      {properties && properties.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-6 text-muted">
          <p className="font-medium text-fg mb-1">
            You're not a member of any property yet.
          </p>
          <p>
            Ask the admin to add you. They can do it from{" "}
            <Link to="/admin/properties" className="underline">
              /admin/properties
            </Link>{" "}
            → choose a property → <em>Members</em>.
          </p>
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
                  {hexCount(p.included_hexes)} hexes ·{" "}
                  {p.center_lat != null && p.center_lng != null
                    ? `${p.center_lat.toFixed(3)}, ${p.center_lng.toFixed(3)}`
                    : "no centre"}
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
