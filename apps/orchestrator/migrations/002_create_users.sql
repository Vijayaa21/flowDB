-- FlowDB persistent user records
-- Stores GitHub OAuth identity for auditability and branch ownership.

CREATE TABLE IF NOT EXISTS flowdb_users (
  id             BIGSERIAL    PRIMARY KEY,
  github_id      TEXT         NOT NULL UNIQUE,
  github_login   TEXT         NOT NULL,
  github_email   TEXT,
  display_name   TEXT,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flowdb_users_github_id_idx  ON flowdb_users(github_id);
CREATE INDEX IF NOT EXISTS flowdb_users_last_seen_idx  ON flowdb_users(last_seen_at DESC);
