import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { ForkTimeoutError, PostgreSQLForkEngine } from "../src";

const TEST_DB_PREFIX = "flowdb_test";

let container: PostgreSqlContainer | undefined;
let maintenanceUrl: string;

async function queryExists(databaseName: string): Promise<boolean> {
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [databaseName]
    );
    return result.rows[0]?.exists ?? false;
  } finally {
    await client.end();
  }
}

async function createDatabase(databaseName: string): Promise<void> {
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(databaseName: string): Promise<void> {
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("postgres")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  maintenanceUrl = container.getConnectionUri();
});

afterAll(async () => {
  if (container) {
    await container.stop();
  }
});

describe("PostgreSQLForkEngine", () => {
  test("fork creates a template-based branch database and returns URL", async () => {
    const engine = new PostgreSQLForkEngine();
    const sourceName = `${TEST_DB_PREFIX}_source_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(sourceName);

    const sourceUrl = withDatabaseName(maintenanceUrl, sourceName);
    const sourceClient = new Client({ connectionString: sourceUrl });
    await sourceClient.connect();
    await sourceClient.query("CREATE TABLE widgets(id SERIAL PRIMARY KEY, name TEXT NOT NULL)");
    await sourceClient.query("INSERT INTO widgets(name) VALUES ($1)", ["seed-row"]);
    await sourceClient.end();

    const branchUrl = await engine.fork(sourceUrl, "feature-a");
    const branchName = new URL(branchUrl).pathname.replace(/^\//, "");

    const branchClient = new Client({ connectionString: branchUrl });
    await branchClient.connect();
    const result = await branchClient.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM widgets WHERE name = $1",
      ["seed-row"]
    );
    await branchClient.end();

    expect(branchUrl).toContain(branchName);
    expect(result.rows[0]?.count).toBe("1");

    await engine.teardown(branchUrl);
    await dropDatabase(sourceName);
  });

  test("fork throws ForkTimeoutError when operation exceeds timeout threshold", async () => {
    const engine = new PostgreSQLForkEngine({ forkTimeoutMs: -1 });
    const sourceName = `${TEST_DB_PREFIX}_slow_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(sourceName);
    const sourceUrl = withDatabaseName(maintenanceUrl, sourceName);

    await expect(engine.fork(sourceUrl, "timeout")).rejects.toBeInstanceOf(ForkTimeoutError);

    await dropDatabase(sourceName);
  });

  test("teardown drops the branch database safely", async () => {
    const engine = new PostgreSQLForkEngine();
    const dbName = `${TEST_DB_PREFIX}_teardown_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(dbName);
    const branchUrl = withDatabaseName(maintenanceUrl, dbName);

    await engine.teardown(branchUrl);

    const stillExists = await queryExists(dbName);
    expect(stillExists).toBe(false);
  });

  test("listBranches returns only FlowDB-managed branch databases", async () => {
    const engine = new PostgreSQLForkEngine();
    const sourceName = `${TEST_DB_PREFIX}_list_source_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(sourceName);
    const sourceUrl = withDatabaseName(maintenanceUrl, sourceName);

    const branchAUrl = await engine.fork(sourceUrl, "alpha");
    const branchBUrl = await engine.fork(sourceUrl, "beta");
    const externalDb = `${TEST_DB_PREFIX}_external_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(externalDb);

    const branches = await engine.listBranches(maintenanceUrl);
    const branchAName = new URL(branchAUrl).pathname.replace(/^\//, "");
    const branchBName = new URL(branchBUrl).pathname.replace(/^\//, "");

    expect(branches).toContain(branchAName);
    expect(branches).toContain(branchBName);
    expect(branches).not.toContain(externalDb);

    await engine.teardown(branchAUrl);
    await engine.teardown(branchBUrl);
    await dropDatabase(sourceName);
    await dropDatabase(externalDb);
  });

  test("healthCheck returns true for reachable database and false for unreachable database", async () => {
    const engine = new PostgreSQLForkEngine();
    const healthy = await engine.healthCheck(maintenanceUrl);

    const invalidUrl = withDatabaseName(maintenanceUrl, `missing_${randomUUID().replace(/-/g, "")}`);
    const unhealthy = await engine.healthCheck(invalidUrl);

    expect(healthy).toBe(true);
    expect(unhealthy).toBe(false);
  });
});