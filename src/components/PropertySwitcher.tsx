// ARB-094: Property switcher dropdown shown in the app header when the user
// is inside a /properties/:propertyId route. Lists the user's memberships and
// includes a "Pick another" link back to /properties.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Property } from "../lib/api";
import { t } from "../lib/strings";

export function PropertySwitcher() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load the list the first time the switcher opens.
  useEffect(() => {
    if (!open || properties !== null) return;
    api
      .listProperties()
      .then(setProperties)
      .catch(() => setError(t.failedToLoad));
  }, [open, properties]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!propertyId) return null;

  const current = properties?.find((p) => p.id === propertyId);
  const label = current?.name ?? t.switcherLabel;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-fg/80 hover:text-fg border border-black/15 rounded-md px-2 py-1"
      >
        <span className="max-w-[200px] truncate">{label}</span>
        <span aria-hidden className="text-fg/50">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-white border border-black/15 rounded-md shadow-md z-30 text-sm">
          {error && (
            <div className="px-3 py-2 text-xs text-red-700 border-b border-black/5">
              {error}
            </div>
          )}
          {properties === null && !error && (
            <div className="px-3 py-2 text-xs text-fg/60">{t.loading}</div>
          )}
          {properties && properties.length === 0 && (
            <div className="px-3 py-2 text-xs text-fg/60">{t.switcherNone}</div>
          )}
          {properties && properties.length > 0 && (
            <ul>
              {properties.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (p.id !== propertyId) {
                        navigate(`/properties/${p.id}`);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-black/5 ${
                      p.id === propertyId ? "font-medium bg-black/[0.03]" : ""
                    }`}
                  >
                    <div className="truncate">{p.name}</div>
                    <div className="text-[11px] text-fg/50 truncate">
                      {t.hexes(hexCount(p.included_hexes))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-black/10">
            <Link
              to="/properties"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-xs text-fg/70 hover:bg-black/5"
            >
              {t.switcherPickAnother}
            </Link>
          </div>
        </div>
      )}
    </div>
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
