-- Categorised map items + per-item colour override.
-- Additive and back-compatible: every existing plant becomes category 'kasvi'
-- with no colour override (so it renders in the category's default green).

ALTER TABLE plants ADD COLUMN category TEXT NOT NULL DEFAULT 'kasvi';
ALTER TABLE plants ADD COLUMN color TEXT;
