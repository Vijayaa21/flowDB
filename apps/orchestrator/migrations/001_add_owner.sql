ALTER TABLE flowdb_branches
  ADD COLUMN IF NOT EXISTS owner_github_id TEXT;

UPDATE flowdb_branches
SET owner_github_id = 'legacy'
WHERE owner_github_id IS NULL;

ALTER TABLE flowdb_branches
  ALTER COLUMN owner_github_id SET NOT NULL;

ALTER TABLE flowdb_branches
  DROP CONSTRAINT IF EXISTS flowdb_branches_branch_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS flowdb_branches_owner_branch_uidx
  ON flowdb_branches(owner_github_id, branch_name);

CREATE INDEX IF NOT EXISTS flowdb_branches_owner_github_id_idx
  ON flowdb_branches(owner_github_id);
