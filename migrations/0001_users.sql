-- ARB-020: users table
-- Owns auth identity. Email is the login identifier; passwords are PBKDF2-SHA256
-- hashed with a per-user salt before insert (see worker/lib/auth.ts in ARB-030).

CREATE TABLE users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
