-- ARB-025: photos
-- A photo attaches to either a plant OR a cell, never both — enforced by
-- CHECK constraint. r2_key is the path inside the R2 bucket; bytes are
-- served via auth-checked GET /photos/:id (PRD §8.3).

CREATE TABLE photos (
  id                TEXT    PRIMARY KEY,
  plant_id          TEXT             REFERENCES plants(id) ON DELETE CASCADE,
  cell_property_id  TEXT             REFERENCES properties(id) ON DELETE RESTRICT,
  cell_h3_res15     TEXT,
  r2_key            TEXT    NOT NULL,
  caption           TEXT,
  taken_at          INTEGER,
  uploaded_at       INTEGER NOT NULL,
  uploaded_by       TEXT    NOT NULL REFERENCES users(id),
  CHECK (
    plant_id IS NOT NULL
    OR (cell_property_id IS NOT NULL AND cell_h3_res15 IS NOT NULL)
  ),
  CHECK (
    NOT (plant_id IS NOT NULL AND cell_property_id IS NOT NULL)
  )
);

CREATE INDEX idx_photos_plant ON photos (plant_id);
CREATE INDEX idx_photos_cell ON photos (cell_property_id, cell_h3_res15);
