import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { ForkEngine } from "../src";

const TEST_DB_PREFIX = "flowdb_test";

let container: StartedPostgreSqlContainer | undefined;
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
  test("fork creates a template-based database and returns fork metadata under 500ms", async () => {
    const engine = new ForkEngine();
    const sourceName = `${TEST_DB_PREFIX}_source_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(sourceName);

    const sourceUrl = withDatabaseName(maintenanceUrl, sourceName);
    const sourceClient = new Client({ connectionString: sourceUrl });
    await sourceClient.connect();
    await sourceClient.query("CREATE TABLE widgets(id SERIAL PRIMARY KEY, name TEXT NOT NULL)");
    await sourceClient.query("INSERT INTO widgets(name) VALUES ($1)", ["seed-row"]);
    await sourceClient.end();

    const forkResult = await engine.fork(sourceUrl, "feature-a");
    const branchUrl = forkResult.branchDatabaseUrl;
    const branchName = new URL(branchUrl).pathname.replace(/^\//, "");

    const branchClient = new Client({ connectionString: branchUrl });
    await branchClient.connect();
    const queryResult = await branchClient.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM widgets WHERE name = $1",
      ["seed-row"]
    );
    await branchClient.end();

    expect(forkResult.branchName).toBe("feature-a");
    expect(forkResult.forkedAt).toBeInstanceOf(Date);
    expect(forkResult.durationMs).toBeLessThan(500);
    expect(branchName).toBe("flowdb_feature_a");
    expect(queryResult.rows[0]?.count).toBe("1");

    await engine.teardown(branchUrl);
    await dropDatabase(sourceName);
  });

  test("teardown drops the branch database safely", async () => {
    const engine = new ForkEngine();
    const dbName = `${TEST_DB_PREFIX}_teardown_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(dbName);
    const branchUrl = withDatabaseName(maintenanceUrl, dbName);

    const connectionClient = new Client({ connectionString: branchUrl });
    await connectionClient.connect();
    await connectionClient.query("SELECT 1");

    await engine.teardown(branchUrl);
    await connectionClient.end().catch(() => undefined);

    const stillExists = await queryExists(dbName);
    expect(stillExists).toBe(false);
  });

  test("listBranches returns FlowDB databases with size and createdAt", async () => {
    const engine = new ForkEngine();
    const sourceName = `${TEST_DB_PREFIX}_list_source_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(sourceName);
    const sourceUrl = withDatabaseName(maintenanceUrl, sourceName);

    const branchAResult = await engine.fork(sourceUrl, "alpha");
    const branchBResult = await engine.fork(sourceUrl, "beta");
    const externalDb = `${TEST_DB_PREFIX}_external_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
    await createDatabase(externalDb);

    const branches = await engine.listBranches(maintenanceUrl);
    const branchAName = new URL(branchAResult.branchDatabaseUrl).pathname.replace(/^\//, "");
    const branchBName = new URL(branchBResult.branchDatabaseUrl).pathname.replace(/^\//, "");
    const branchA = branches.find((branch) => branch.name === branchAName);
    const branchB = branches.find((branch) => branch.name === branchBName);

    expect(branchA).toBeDefined();
    expect(branchB).toBeDefined();
    expect(branchA?.size).toBeGreaterThan(0);
    expect(branchA?.createdAt).toBeInstanceOf(Date);
    expect(branches.some((branch) => branch.name === externalDb)).toBe(false);

    await engine.teardown(branchAResult.branchDatabaseUrl);
    await engine.teardown(branchBResult.branchDatabaseUrl);
    await dropDatabase(sourceName);
    await dropDatabase(externalDb);
  });

  test("healthCheck returns true for reachable database and false for unreachable database", async () => {
    const engine = new ForkEngine();
    const healthy = await engine.healthCheck(maintenanceUrl);

    const invalidUrl = withDatabaseName(maintenanceUrl, `missing_${randomUUID().replace(/-/g, "")}`);
    const unhealthy = await engine.healthCheck(invalidUrl);

    expect(healthy).toBe(true);
    expect(unhealthy).toBe(false);
  });
});