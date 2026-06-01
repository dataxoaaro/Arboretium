-- ARB-026: password_reset_tokens
-- Stores sha256(token), NEVER the cleartext, so a DB read leak does not yield
-- working reset links (PRD §8.7).

CREATE TABLE password_reset_tokens (
  token_hash  TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by   TEXT    NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_reset_tokens_user ON password_reset_tokens (user_id);
