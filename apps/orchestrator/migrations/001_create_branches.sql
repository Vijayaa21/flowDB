CREATE TABLE IF NOT EXISTS flowdb_branches (
  id BIGSERIAL PRIMARY KEY,
  branch_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  branch_url TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_github_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pr_number INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS flowdb_branches_owner_branch_uidx
  ON flowdb_branches(owner_github_id, branch_name);

CREATE INDEX IF NOT EXISTS flowdb_branches_owner_github_id_idx
  ON flowdb_branches(owner_github_id);

CREATE INDEX IF NOT EXISTS flowdb_branches_created_at_idx
  ON flowdb_branches(created_at DESC);

CREATE INDEX IF NOT EXISTS flowdb_branches_pr_number_idx
  ON flowdb_branches(pr_number)
  WHERE pr_number IS NOT NULL;
