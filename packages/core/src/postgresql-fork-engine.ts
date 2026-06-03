import { performance } from "node:perf_hooks";
import { Client, type ClientConfig } from "pg";

import { ForkTimeoutError } from "./errors";
import type { BranchInfo, ForkResult } from "./types";

const FORK_TIMEOUT_MS = 5000;

type BranchRow = {
  name: string;
  size: string | number;
  created_at: Date | string;
};

export class ForkEngine {
  public async fork(sourceDatabaseUrl: string, branchName: string): Promise<ForkResult> {
    const sourceDatabaseName = this.getDatabaseName(new URL(sourceDatabaseUrl));
    const branchDatabaseName = this.buildBranchDatabaseName(branchName);
    const adminUrl = this.toMaintenanceDatabaseUrl(sourceDatabaseUrl);
    const startedAt = performance.now();
    const forkedAt = new Date();
    const client = await this.connect(adminUrl);

    try {
      await client.query(
        `CREATE DATABASE ${this.quoteIdentifier(branchDatabaseName)} TEMPLATE ${this.quoteIdentifier(sourceDatabaseName)}`
      );
    } finally {
      await client.end();
    }

    const durationMs = performance.now() - startedAt;
    console.info(`[FlowDB] fork branch=${branchDatabaseName} durationMs=${durationMs.toFixed(2)}`);
    const branchDatabaseUrl = this.withDatabaseName(sourceDatabaseUrl, branchDatabaseName);

    if (durationMs > FORK_TIMEOUT_MS) {
      await this.teardown(branchDatabaseUrl);
      throw new ForkTimeoutError(durationMs, FORK_TIMEOUT_MS);
    }

    return {
      branchDatabaseUrl,
      branchName,
      forkedAt,
      durationMs,
    };
  }

  public async teardown(branchDatabaseUrl: string): Promise<void> {
    const databaseName = this.getDatabaseName(new URL(branchDatabaseUrl));
    const adminUrl = this.toMaintenanceDatabaseUrl(branchDatabaseUrl);
    const client = await this.connect(adminUrl);

    try {
      await client.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
        [databaseName]
      );
      await client.query(`DROP DATABASE IF EXISTS ${this.quoteIdentifier(databaseName)}`);
    } finally {
      await client.end();
    }
  }

  public async listBranches(hostUrl: string): Promise<BranchInfo[]> {
    const adminUrl = this.toMaintenanceDatabaseUrl(hostUrl);
    const client = await this.connect(adminUrl);

    try {
      const result = await client.query<BranchRow>(
        `
        SELECT
          d.datname AS name,
          pg_database_size(d.datname) AS size,
          COALESCE((pg_stat_file(format('base/%s/PG_VERSION', d.oid), true)).modification, NOW()) AS created_at
        FROM pg_database d
        WHERE d.datname LIKE 'flowdb_%'
        ORDER BY d.datname ASC
        `
      );

      return result.rows.map((row) => ({
        name: row.name,
        size: Number(row.size),
        createdAt: new Date(row.created_at),
      }));
    } finally {
      await client.end();
    }
  }

  public async healthCheck(databaseUrl: string): Promise<boolean> {
    let client: Client | undefined;
    try {
      client = await this.connect(databaseUrl);
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  private async connect(connectionString: string): Promise<Client> {
    const config: ClientConfig = { connectionString };
    const client = new Client(config);
    await client.connect();
    return client;
  }

  private getDatabaseName(url: URL): string {
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, "").trim());
    if (!databaseName) {
      throw new Error("Database URL must include a database name in the pathname.");
    }
    return databaseName;
  }

  private withDatabaseName(connectionString: string, databaseName: string): string {
    const url = new URL(connectionString);
    url.pathname = `/${encodeURIComponent(databaseName)}`;
    return url.toString();
  }

  private toMaintenanceDatabaseUrl(connectionString: string): string {
    const url = new URL(connectionString);
    url.pathname = "/postgres";
    return url.toString();
  }

  private buildBranchDatabaseName(branchName: string): string {
    const sanitized = this.sanitizeName(branchName);
    return `flowdb_${sanitized}`.slice(0, 63);
  }

  private sanitizeName(value: string): string {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return sanitized || "branch";
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

export class PostgreSQLForkEngine extends ForkEngine {}
