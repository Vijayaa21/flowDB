-- FlowDB Orchestrator control-plane metadata schema (PR-A)
-- This migration establishes foundational multi-tenant entities and operation tracking.

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  source_database_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  database_name TEXT NOT NULL,
  database_url TEXT NOT NULL,
  source_database_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'active', 'tearing_down', 'deleted', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fork_operations (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure unique active branch names per project while allowing soft-deleted name reuse.
CREATE UNIQUE INDEX IF NOT EXISTS branches_project_name_active_uidx
  ON branches(project_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects(organization_id);

CREATE INDEX IF NOT EXISTS branches_project_id_idx ON branches(project_id);
CREATE INDEX IF NOT EXISTS branches_status_idx ON branches(status);
CREATE INDEX IF NOT EXISTS branches_created_at_idx ON branches(created_at DESC);

CREATE INDEX IF NOT EXISTS fork_operations_project_id_idx ON fork_operations(project_id);
CREATE INDEX IF NOT EXISTS fork_operations_status_idx ON fork_operations(status);
CREATE INDEX IF NOT EXISTS fork_operations_started_at_idx ON fork_operations(started_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_project_id_idx ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
