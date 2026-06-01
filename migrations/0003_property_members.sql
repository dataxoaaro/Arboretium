-- ARB-022: property_members
-- Presence in this table = full edit access in v1 (PRD §6.9).

CREATE TABLE property_members (
  property_id TEXT    NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by    TEXT    NOT NULL REFERENCES users(id),
  added_at    INTEGER NOT NULL,
  PRIMARY KEY (property_id, user_id)
);

CREATE INDEX idx_property_members_user ON property_members (user_id);
