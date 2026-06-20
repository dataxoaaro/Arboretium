// ARB-093: Layout route mounted at /properties/:propertyId. Loads the
// property (membership-checked by the worker), supplies it via context, and
// renders the nested route (default = map view).

import { useEffect, useState } from "react";
import { Outlet, useParams, Navigate } from "react-router-dom";
import { api, ApiCallError, type Property } from "../lib/api";
import { cachedRead } from "../lib/cached-read";
import { CurrentPropertyContext } from "../lib/property-context";
import { t } from "../lib/strings";

export function PropertyLayout() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    cachedRead(`property:${propertyId}`, () => api.getProperty(propertyId))
      .then((r) => {
        if (!cancelled) setProperty(r.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ApiCallError ? err.status : 500;
        setError({ status, message: t.propertyLoadFailed });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (!propertyId) return <Navigate to="/properties" replace />;

  if (loading) {
    return <div className="p-6 text-sm text-muted">{t.propertyLoading}</div>;
  }

  if (error) {
    // 404 (not a member, archived, or unknown) → kick back to picker.
    if (error.status === 404) {
      return <Navigate to="/properties" replace />;
    }
    return (
      <div className="p-6 max-w-lg">
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
          {error.message}
        </div>
      </div>
    );
  }

  if (!property) return null;

  return (
    <CurrentPropertyContext.Provider value={property}>
      <Outlet />
    </CurrentPropertyContext.Provider>
  );
}
