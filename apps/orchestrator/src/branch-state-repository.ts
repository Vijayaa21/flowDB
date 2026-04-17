import { Pool } from "pg";

import type { BranchRecord, BranchStatus } from "./types";

type BranchRow = {
  id: string | number;
  branch_name: string;
  source_url: string;
  branch_url: string;
  status: BranchStatus;
  owner_github_id: string;
  created_at: Date;
  pr_number: number | null;
};

export type BranchStateRepository = {
  create(
    ownerGithubId: string,
    record: {
      branchName: string;
      sourceUrl: string;
      branchUrl: string;
      status: BranchStatus;
    }
  ): Promise<BranchRecord>;
  upsert(
    ownerGithubId: string,
    record: {
      prNumber?: number | null;
      branchName: string;
      sourceUrl: string;
      branchUrl: string;
      status: BranchStatus;
    }
  ): Promise<void>;
  getByBranchName(ownerGithubId: string, branchName: string): Promise<BranchRecord | null>;
  getByPrNumber(ownerGithubId: string, prNumber: number): Promise<BranchRecord | null>;
  setStatus(ownerGithubId: string, branchName: string, status: BranchStatus): Promise<void>;
  listActive(ownerGithubId: string): Promise<BranchRecord[]>;
};

function mapBranchRow(row: BranchRow): BranchRecord {
  return {
    id: String(row.id),
    branchName: row.branch_name,
    sourceUrl: row.source_url,
    branchUrl: row.branch_url,
    status: row.status,
    ownerGithubId: row.owner_github_id,
    createdAt: row.created_at,
  };
}

export class PostgresBranchStateRepository implements BranchStateRepository {
  private readonly pool: Pool;
  private schemaReady?: Promise<void>;

  public constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async create(
    ownerGithubId: string,
    record: {
      branchName: string;
      sourceUrl: string;
      branchUrl: string;
      status: BranchStatus;
    }
  ): Promise<BranchRecord> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      INSERT INTO flowdb_branches (branch_name, source_url, branch_url, status, owner_github_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (owner_github_id, branch_name)
      DO UPDATE SET
        source_url = EXCLUDED.source_url,
        branch_url = EXCLUDED.branch_url,
        status = EXCLUDED.status
      RETURNING id, branch_name, source_url, branch_url, status, owner_github_id, created_at, pr_number
      `,
      [record.branchName, record.sourceUrl, record.branchUrl, record.status, ownerGithubId]
    );

    return mapBranchRow(result.rows[0]!);
  }

  public async upsert(
    ownerGithubId: string,
    record: {
      prNumber?: number | null;
      branchName: string;
      sourceUrl: string;
      branchUrl: string;
      status: BranchStatus;
    }
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO flowdb_branches (owner_github_id, pr_number, branch_name, source_url, branch_url, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (owner_github_id, branch_name)
      DO UPDATE SET
        pr_number = EXCLUDED.pr_number,
        source_url = EXCLUDED.source_url,
        branch_url = EXCLUDED.branch_url,
        status = EXCLUDED.status
      `,
      [
        ownerGithubId,
        record.prNumber ?? null,
        record.branchName,
        record.sourceUrl,
        record.branchUrl,
        record.status,
      ]
    );
  }

  public async getByBranchName(
    ownerGithubId: string,
    branchName: string
  ): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT id, branch_name, source_url, branch_url, status, owner_github_id, created_at, pr_number
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND branch_name = $2
      LIMIT 1
      `,
      [ownerGithubId, branchName]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async getByPrNumber(
    ownerGithubId: string,
    prNumber: number
  ): Promise<BranchRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT id, branch_name, source_url, branch_url, status, owner_github_id, created_at, pr_number
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND pr_number = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [ownerGithubId, prNumber]
    );
    return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
  }

  public async setStatus(
    ownerGithubId: string,
    branchName: string,
    status: BranchStatus
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      UPDATE flowdb_branches
      SET status = $3
      WHERE owner_github_id = $1 AND branch_name = $2
      `,
      [ownerGithubId, branchName, status]
    );
  }

  public async listActive(ownerGithubId: string): Promise<BranchRecord[]> {
    await this.ensureSchema();
    const result = await this.pool.query<BranchRow>(
      `
      SELECT id, branch_name, source_url, branch_url, status, owner_github_id, created_at, pr_number
      FROM flowdb_branches
      WHERE owner_github_id = $1 AND status <> 'TORN_DOWN'
      ORDER BY created_at DESC
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
            branch_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            branch_url TEXT NOT NULL,
            status TEXT NOT NULL,
            owner_github_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            pr_number INTEGER
          );
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS branch_name TEXT;
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS source_url TEXT;
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS branch_url TEXT;
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS status TEXT;
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS owner_github_id TEXT;
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
          ALTER TABLE flowdb_branches ADD COLUMN IF NOT EXISTS pr_number INTEGER;
          UPDATE flowdb_branches
          SET owner_github_id = 'legacy'
          WHERE owner_github_id IS NULL;
          UPDATE flowdb_branches
          SET source_url = ''
          WHERE source_url IS NULL;
          UPDATE flowdb_branches
          SET branch_url = ''
          WHERE branch_url IS NULL;
          UPDATE flowdb_branches
          SET status = 'READY'
          WHERE status IS NULL;
          UPDATE flowdb_branches
          SET created_at = NOW()
          WHERE created_at IS NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN owner_github_id SET NOT NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN branch_name SET NOT NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN source_url SET NOT NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN branch_url SET NOT NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN status SET NOT NULL;
          ALTER TABLE flowdb_branches ALTER COLUMN created_at SET NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS flowdb_branches_owner_branch_uidx
            ON flowdb_branches(owner_github_id, branch_name);
          CREATE INDEX IF NOT EXISTS flowdb_branches_pr_number_idx
            ON flowdb_branches(pr_number)
            WHERE pr_number IS NOT NULL;
          CREATE INDEX IF NOT EXISTS flowdb_branches_owner_github_id_idx ON flowdb_branches(owner_github_id);
          `
        )
        .then(() => undefined);
    }
    await this.schemaReady;
  }
}
