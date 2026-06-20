// Typed fetch wrappers around the Worker API. All calls hit /api/* which
// Vite proxies to the Worker on :8787 in dev (and sits on the same origin
// in prod via a Cloudflare Pages route or path-based deploy).

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: number;
}

export interface Property {
  id: string;
  owner_id: string;
  name: string;
  boundary_geojson: string | null;
  /** JSON-encoded string[] of res-15 H3 indices. Parse with JSON.parse. */
  included_hexes: string;
  center_lat: number | null;
  center_lng: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Plant {
  id: string;
  property_id: string;
  h3_res15: string;
  lat: number;
  lng: number;
  common_name: string;
  latin_name: string | null;
  plant_type: string | null;
  planted_date: string | null;
  source: string | null;
  notes: string | null;
  archived: 0 | 1;
  created_by: string;
  created_at: number;
  last_edited_by: string;
  updated_at: number;
}

export interface PlantInput {
  property_id: string;
  h3_res15: string;
  lat: number;
  lng: number;
  common_name: string;
  latin_name?: string | null;
  plant_type?: string | null;
  planted_date?: string | null;
  source?: string | null;
  notes?: string | null;
}

export type PlantPatch = Partial<Omit<PlantInput, "property_id">>;

export interface Photo {
  id: string;
  plant_id: string | null;
  cell_property_id: string | null;
  cell_h3_res15: string | null;
  r2_key: string;
  caption: string | null;
  taken_at: number | null;
  uploaded_at: number;
  uploaded_by: string;
  bytes: number;
}

/** A hex cell that carries notes and/or photos (map overlay summary). */
export interface CellSummary {
  h3_res15: string;
  notes: string | null;
  photo_count: number;
}

/** Full cell detail: notes + the plants and cell photos anchored to the hex. */
export interface CellDetail {
  property_id: string;
  h3_res15: string;
  notes: string | null;
  plants: Plant[];
  photos: Photo[];
}

export interface ApiError {
  error: string;
}

export class ApiCallError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiCallError(
      body?.error ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export const api = {
  register(input: {
    email: string;
    password: string;
    display_name?: string;
    site_password: string;
  }): Promise<User> {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }): Promise<User> {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  logout(): Promise<{ ok: true }> {
    return request("/auth/logout", { method: "POST" });
  },

  me(): Promise<User> {
    return request("/auth/me");
  },

  changePassword(input: {
    current_password: string;
    new_password: string;
  }): Promise<{ ok: true }> {
    return request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  resetPassword(input: {
    token: string;
    new_password: string;
  }): Promise<{ ok: true }> {
    return request(`/auth/reset/${encodeURIComponent(input.token)}`, {
      method: "POST",
      body: JSON.stringify({ new_password: input.new_password }),
    });
  },

  listProperties(): Promise<Property[]> {
    return request("/properties");
  },

  getProperty(id: string): Promise<Property> {
    return request(`/properties/${id}`);
  },

  listPlants(propertyId: string): Promise<Plant[]> {
    return request(`/plants?property_id=${encodeURIComponent(propertyId)}`);
  },

  getPlant(id: string): Promise<Plant> {
    return request(`/plants/${id}`);
  },

  createPlant(input: PlantInput): Promise<Plant> {
    return request("/plants", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updatePlant(id: string, patch: PlantPatch): Promise<Plant> {
    return request(`/plants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deletePlant(id: string): Promise<{ ok: true }> {
    return request(`/plants/${id}`, { method: "DELETE" });
  },

  listPhotosForPlant(plantId: string): Promise<Photo[]> {
    return request(`/photos?plant_id=${encodeURIComponent(plantId)}`);
  },

  // --- cells (hex notes + cell detail) ---

  /** Annotated cells (notes/photos) in a property, for the map overlay. */
  listCells(propertyId: string): Promise<CellSummary[]> {
    return request(`/cells?property_id=${encodeURIComponent(propertyId)}`);
  },

  /** Full detail for one hex: notes + plants + cell photos. */
  getCell(propertyId: string, h3: string): Promise<CellDetail> {
    return request(
      `/cells/${encodeURIComponent(propertyId)}/${encodeURIComponent(h3)}`,
    );
  },

  /** Upsert a hex's notes (create-on-write). Empty string clears them. */
  setCellNotes(
    propertyId: string,
    h3: string,
    notes: string,
  ): Promise<{ property_id: string; h3_res15: string; notes: string | null }> {
    return request(
      `/cells/${encodeURIComponent(propertyId)}/${encodeURIComponent(h3)}`,
      { method: "PUT", body: JSON.stringify({ notes }) },
    );
  },

  /** Upload bytes via multipart. Server reads `file` + metadata fields. */
  async uploadPhoto(input: {
    blob: Blob;
    mimeType: string;
    plantId?: string;
    cellPropertyId?: string;
    cellH3?: string;
    takenAt?: number | null;
    caption?: string | null;
    filename?: string;
  }): Promise<Photo> {
    const form = new FormData();
    const filename =
      input.filename ?? `photo.${input.mimeType.split("/")[1] ?? "bin"}`;
    form.append(
      "file",
      new File([input.blob], filename, { type: input.mimeType }),
    );
    if (input.plantId) form.append("plant_id", input.plantId);
    if (input.cellPropertyId)
      form.append("cell_property_id", input.cellPropertyId);
    if (input.cellH3) form.append("cell_h3_res15", input.cellH3);
    if (input.takenAt != null) form.append("taken_at", String(input.takenAt));
    if (input.caption != null) form.append("caption", input.caption);

    const res = await fetch("/api/photos", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiError | null;
      throw new ApiCallError(
        body?.error ?? `Upload failed (${res.status})`,
        res.status,
      );
    }
    return res.json() as Promise<Photo>;
  },

  updatePhoto(id: string, caption: string | null): Promise<Photo> {
    return request(`/photos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ caption }),
    });
  },

  deletePhoto(id: string): Promise<{ ok: true }> {
    return request(`/photos/${id}`, { method: "DELETE" });
  },

  /** Convenience URL for an <img src> — the SPA will hit the proxy. */
  photoUrl(id: string): string {
    return `/api/photos/${id}`;
  },
};
