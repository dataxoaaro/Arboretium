// ARB-028: Typed query helpers around the D1 binding.
// No ORM — just thin functions returning typed rows. One file per table is
// added as features land; this file owns shared types and primitives.

export type UnixMs = number;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: UnixMs;
}

export interface PropertyRow {
  id: string;
  owner_id: string;
  name: string;
  boundary_geojson: string | null;
  /** JSON-encoded array of res-15 H3 indices. Parse with parseHexes(). */
  included_hexes: string;
  center_lat: number | null;
  center_lng: number | null;
  archived_at: UnixMs | null;
  created_at: UnixMs;
  updated_at: UnixMs;
}

export interface PlantRow {
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
  /** Built-in category key (e.g. 'kasvi', 'linnunpontto', 'riistakamera'). */
  category: string;
  /** Optional per-item colour override (hex); null = use the category colour. */
  color: string | null;
  archived: 0 | 1;
  created_by: string;
  created_at: UnixMs;
  last_edited_by: string;
  updated_at: UnixMs;
}

export interface CellRow {
  property_id: string;
  h3_res15: string;
  notes: string | null;
  created_at: UnixMs;
  updated_at: UnixMs;
}

export interface PhotoRow {
  id: string;
  plant_id: string | null;
  cell_property_id: string | null;
  cell_h3_res15: string | null;
  r2_key: string;
  caption: string | null;
  taken_at: UnixMs | null;
  uploaded_at: UnixMs;
  uploaded_by: string;
  /** Stored byte size — summed to enforce the R2 storage budget. */
  bytes: number;
}

export interface PasswordResetTokenRow {
  /** sha256 hash of the cleartext token; the cleartext only lives in the URL. */
  token_hash: string;
  user_id: string;
  issued_by: string;
  created_at: UnixMs;
  expires_at: UnixMs;
  consumed_at: UnixMs | null;
}

/** Parse a property's included_hexes JSON column into a string[] of H3 indices. */
export function parseHexes(json: string): string[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) {
    throw new Error("included_hexes is not a string[]");
  }
  return parsed as string[];
}

/** Encode a string[] of H3 indices for storage in included_hexes. */
export function encodeHexes(hexes: string[]): string {
  return JSON.stringify(hexes);
}

/** Current Unix epoch in milliseconds. */
export function now(): UnixMs {
  return Date.now();
}
