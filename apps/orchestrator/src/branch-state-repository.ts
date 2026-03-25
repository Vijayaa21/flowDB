import { Pool } from "pg";

import type { BranchRecord, BranchStatus } from "./types";

type BranchRow = {
  pr_number: number;
  branch_name: string;
  branch_database_url: string;
  status: BranchStatus;
  created_at: Date;
  updated_at: Date;
};

export type BranchStateRepository = {
  upsert(ownerGithubId: string, record: { prNumber: number; branchName: string; branchDatabaseUrl: string; status: BranchStatus }): Promise<void>;
  getByBranchName(ownerGithubId: string, branchName: string): Promise<BranchRecord | null>;
  getByPrNumber(ownerGithubId: string, prNumber: number): Promise<BranchRecord | null>;
  setStatus(ownerGithubId: string, branchName: string, status: BranchStatus): Promise<void>;
  listActive(ownerGithubId: string): Promise<BranchRecord[]>;
};

function mapBranchRow(row: BranchRow): BranchRecord {
  return {
    prNumber: row.pr_number,
    branchName: row.branch_name,
    branchDatabaseUrl: row.branch_database_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class PostgresBranchStateRepository implements BranchStateRepository {
  private readonly pool: Pool;
  private schemaReady?: Promise<void>;

  public constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async upsert(ownerGithubId: string, record: {
    prNumber: number;
    branchName: string;
    branchDatabaseUrl: string;
    status: BranchStatus;
  }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO flowdb_branches (owner_github_id, pr_number, branch_name, branch_database_url, status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (owner_github_id, branch_name)
      DO UPDATE SET
        pr_number = EXCLUDED.pr_number,
        branch_database_url = EXCLUDED.branch_database_url,
        status = EXCLUDED.status,
        updated_at = NOW()
      `,
      [ownerGithubId, record.prNumber, record.branchName, record.branchDatabaseUrl, record.status]
    );
  }

  public async getByBranchName(ownerGithubId: string, branchName: string): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND branch_name = $2
      LIMIT 1
      `,
      [ownerGithubId, branchName]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async getByPrNumber(ownerGithubId: string, prNumber: number): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND pr_number = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [ownerGithubId, prNumber]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async setStatus(ownerGithubId: string, branchName: string, status: BranchStatus): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE flowdb_branches
      SET status = $3, updated_at = NOW()
      WHERE owner_github_id = $1 AND branch_name = $2
      `,
      [ownerGithubId, branchName, status]
    );
  }

  public async listActive(ownerGithubId: string): Promise<BranchRecord[]> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND status <> 'closed'
      ORDER BY updated_at DESC
      `,
      [ownerGithubId]
    );
    return result.rows.map(mapBranchRow);
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.pool
        .query(
          `
          CREATE TABLE IF NOT EXISTS flowdb_branches (
            id BIGSERIAL PRIMARY KEY,
            owner_github_id TEXT NOT NULL,
            pr_number INTEGER NOT NULL,
            branch_name TEXT NOT NULL,
            branch_database_url TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS owner_github_id TEXT;
          UPDATE flowdb_branches SET owner_github_id = 'legacy' WHERE owner_github_id IS NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN owner_github_id SET NOT NULL;
          ALTER TABLE flowdb_branches DROP CONSTRAINT IF EXISTS flowdb_branches_branch_name_key;
          CREATE UNIQUE INDEX IF NOT EXISTS flowdb_branches_owner_branch_uidx
            ON flowdb_branches(owner_github_id, branch_name);
          CREATE INDEX IF NOT EXISTS flowdb_branches_pr_number_idx ON flowdb_branches(pr_number);
          CREATE INDEX IF NOT EXISTS flowdb_branches_owner_github_id_idx ON flowdb_branches(owner_github_id);
          `
        )
        .then(() => undefined);
    }
    await this.schemaReady;
  }
}