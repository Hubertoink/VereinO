ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'EDITOR', 'USER'));
-- Existing installations need an operator to explicitly assign their first administrator.
CREATE UNIQUE INDEX users_email_normalized ON users (LOWER(email));
CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
