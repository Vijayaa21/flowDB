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
  upsert(record: { prNumber: number; branchName: string; branchDatabaseUrl: string; status: BranchStatus }): Promise<void>;
  getByBranchName(branchName: string): Promise<BranchRecord | null>;
  getByPrNumber(prNumber: number): Promise<BranchRecord | null>;
  setStatus(branchName: string, status: BranchStatus): Promise<void>;
  listActive(): Promise<BranchRecord[]>;
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

  public async upsert(record: {
    prNumber: number;
    branchName: string;
    branchDatabaseUrl: string;
    status: BranchStatus;
  }): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO flowdb_branches (pr_number, branch_name, branch_database_url, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (branch_name)
      DO UPDATE SET
        pr_number = EXCLUDED.pr_number,
        branch_database_url = EXCLUDED.branch_database_url,
        status = EXCLUDED.status,
        updated_at = NOW()
      `,
      [record.prNumber, record.branchName, record.branchDatabaseUrl, record.status]
    );
  }

  public async getByBranchName(branchName: string): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE branch_name = $1
      LIMIT 1
      `,
      [branchName]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async getByPrNumber(prNumber: number): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE pr_number = $1
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [prNumber]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async setStatus(branchName: string, status: BranchStatus): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE flowdb_branches
      SET status = $2, updated_at = NOW()
      WHERE branch_name = $1
      `,
      [branchName, status]
    );
  }

  public async listActive(): Promise<BranchRecord[]> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT pr_number, branch_name, branch_database_url, status, created_at, updated_at
      FROM flowdb_branches
      WHERE status <> 'closed'
      ORDER BY updated_at DESC
      `
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
            pr_number INTEGER NOT NULL,
            branch_name TEXT NOT NULL UNIQUE,
            branch_database_url TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS flowdb_branches_pr_number_idx ON flowdb_branches(pr_number);
          `
        )
        .then(() => undefined);
    }
    await this.schemaReady;
  }
}