-- ARB-024: cells
-- Optional per-hex notes. Insert-on-write: a cell row only exists when there's
-- something to record. Lookups in the deployed app go via h3_res15.

CREATE TABLE cells (
  property_id TEXT    NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  h3_res15    TEXT    NOT NULL,
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (property_id, h3_res15)
);

CREATE INDEX idx_cells_h3 ON cells (h3_res15);
