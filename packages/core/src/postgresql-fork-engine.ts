import { performance } from "node:perf_hooks";
import { Client, type ClientConfig } from "pg";

import { ForkTimeoutError } from "./errors";

type Logger = Pick<Console, "info">;

export type PostgreSQLForkEngineOptions = {
  branchPrefix?: string;
  forkTimeoutMs?: number;
  logger?: Logger;
};

export class PostgreSQLForkEngine {
  private readonly branchPrefix: string;
  private readonly forkTimeoutMs: number;
  private readonly logger: Logger;

  public constructor(options?: PostgreSQLForkEngineOptions) {
    this.branchPrefix = options?.branchPrefix ?? "flowdb_branch";
    this.forkTimeoutMs = options?.forkTimeoutMs ?? 500;
    this.logger = options?.logger ?? console;
  }

  public async fork(sourceDatabaseUrl: string, branchName: string): Promise<string> {
    const sourceUrl = new URL(sourceDatabaseUrl);
    const sourceDatabaseName = this.getDatabaseName(sourceUrl);
    const branchDatabaseName = this.buildBranchDatabaseName(sourceDatabaseName, branchName);
    const adminUrl = this.toMaintenanceDatabaseUrl(sourceDatabaseUrl);
    const adminClient = await this.connect(adminUrl);
    const startedAt = performance.now();

    try {
      await adminClient.query(
        `CREATE DATABASE ${this.quoteIdentifier(branchDatabaseName)} TEMPLATE ${this.quoteIdentifier(sourceDatabaseName)}`
      );
    } finally {
      await adminClient.end();
    }

    const durationMs = performance.now() - startedAt;
    this.logger.info(
      `[FlowDB] fork source=${sourceDatabaseName} branch=${branchDatabaseName} durationMs=${durationMs.toFixed(2)}`
    );

    const branchDatabaseUrl = this.withDatabaseName(sourceDatabaseUrl, branchDatabaseName);

    if (durationMs > this.forkTimeoutMs) {
      await this.teardown(branchDatabaseUrl);
      throw new ForkTimeoutError(durationMs, this.forkTimeoutMs);
    }

    return branchDatabaseUrl;
  }

  public async teardown(branchDatabaseUrl: string): Promise<void> {
    const branchUrl = new URL(branchDatabaseUrl);
    const branchDatabaseName = this.getDatabaseName(branchUrl);
    const adminUrl = this.toMaintenanceDatabaseUrl(branchDatabaseUrl);
    const adminClient = await this.connect(adminUrl);

    try {
      await adminClient.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [branchDatabaseName]
      );
      await adminClient.query(`DROP DATABASE IF EXISTS ${this.quoteIdentifier(branchDatabaseName)}`);
    } finally {
      await adminClient.end();
    }
  }

  public async listBranches(hostUrl: string): Promise<string[]> {
    const adminUrl = this.toMaintenanceDatabaseUrl(hostUrl);
    const adminClient = await this.connect(adminUrl);

    try {
      const result = await adminClient.query<{ datname: string }>(
        "SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname ASC",
        [`${this.branchPrefix}_%`]
      );
      return result.rows.map((row) => row.datname);
    } finally {
      await adminClient.end();
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

  private buildBranchDatabaseName(sourceDatabaseName: string, branchName: string): string {
    const sanitizedSource = this.sanitizeName(sourceDatabaseName);
    const sanitizedBranch = this.sanitizeName(branchName);
    const suffix = Date.now().toString(36);

    return `${this.branchPrefix}_${sanitizedSource}_${sanitizedBranch}_${suffix}`.slice(0, 63);
  }

  private sanitizeName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20);
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}