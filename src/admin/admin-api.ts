// Typed fetch wrappers for /api/admin/*. Mounted under /admin in the SPA
// router. The worker's /admin/* endpoints require an authenticated session
// (any registered user); they 401 when signed out.

import type {
  AdminStats,
  PropertyRow,
  ResetLinkResult,
  UserRow,
} from "./admin-types";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new AdminApiError(
      body?.error ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  // properties
  listProperties(): Promise<PropertyRow[]> {
    return request("/properties");
  },
  createProperty(input: {
    name: string;
    boundary_geojson?: string | null;
    included_hexes?: string;
    center_lat?: number | null;
    center_lng?: number | null;
  }): Promise<PropertyRow> {
    return request("/properties", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateProperty(
    id: string,
    input: Partial<{
      name: string;
      boundary_geojson: string | null;
      included_hexes: string;
      center_lat: number | null;
      center_lng: number | null;
    }>,
  ): Promise<PropertyRow> {
    return request(`/properties/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  archiveProperty(id: string): Promise<{ ok: true; archived_at: number }> {
    return request(`/properties/${id}`, { method: "DELETE" });
  },
  restoreProperty(id: string): Promise<{ ok: true }> {
    return request(`/properties/${id}/restore`, { method: "POST" });
  },

  // users
  listUsers(): Promise<UserRow[]> {
    return request("/users");
  },
  deleteUser(id: string): Promise<{ ok: true }> {
    return request(`/users/${id}`, { method: "DELETE" });
  },
  generateResetLink(
    userId: string,
    issuedBy: string,
  ): Promise<ResetLinkResult> {
    return request(`/users/${userId}/reset-link`, {
      method: "POST",
      body: JSON.stringify({ issued_by: issuedBy }),
    });
  },

  // diagnostics
  stats(): Promise<AdminStats> {
    return request("/stats");
  },
};
