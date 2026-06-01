-- ARB-023: plants
-- property_id is "first-property-of-record" for audit only. Map view queries
-- use h3_res15 against properties.included_hexes (PRD §6.1 spatial-first lookup),
-- so an archived property's plants resurface inside any new property covering
-- the same hex set.

CREATE TABLE plants (
  id              TEXT    PRIMARY KEY,
  property_id     TEXT    NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  h3_res15        TEXT    NOT NULL,
  lat             REAL    NOT NULL,
  lng             REAL    NOT NULL,
  common_name     TEXT    NOT NULL,
  latin_name      TEXT,
  plant_type      TEXT,
  planted_date    TEXT,
  source          TEXT,
  notes           TEXT,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT    NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  last_edited_by  TEXT    NOT NULL REFERENCES users(id),
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_plants_h3 ON plants (h3_res15);
CREATE INDEX idx_plants_property_archived ON plants (property_id, archived);
