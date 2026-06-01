-- ARB-021: properties table
-- archived_at = NULL means active; non-NULL = soft-deleted (PRD §6.1).
-- included_hexes is a JSON array of res-15 H3 indices (TEXT) defining the
-- property's actual usable area; this is the spatial-first lookup driver.

CREATE TABLE properties (
  id               TEXT    PRIMARY KEY,
  owner_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name             TEXT    NOT NULL,
  boundary_geojson TEXT,
  included_hexes   TEXT    NOT NULL DEFAULT '[]',
  center_lat       REAL,
  center_lng       REAL,
  archived_at      INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX idx_properties_owner ON properties (owner_id);
CREATE INDEX idx_properties_archived_at ON properties (archived_at);
