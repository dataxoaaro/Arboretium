// Admin-side row shapes returned by /admin/* worker endpoints. Kept separate
// from src/lib/api.ts because admin extends a few rows with derived fields
// (e.g. UserRow.membership_count) that the user-facing API doesn't return.

export type UnixMs = number;

export interface PropertyRow {
  id: string;
  owner_id: string;
  name: string;
  boundary_geojson: string | null;
  included_hexes: string;
  center_lat: number | null;
  center_lng: number | null;
  archived_at: UnixMs | null;
  created_at: UnixMs;
  updated_at: UnixMs;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  created_at: UnixMs;
  membership_count: number;
}

export interface PropertyMember {
  id: string;
  email: string;
  display_name: string;
  created_at: UnixMs;
  added_at: UnixMs;
  added_by: string;
}

export interface AdminStats {
  users: number;
  properties_active: number;
  properties_archived: number;
  plants: number;
  photos: number;
}

export interface ResetLinkResult {
  token: string;
  expires_at: UnixMs;
}
