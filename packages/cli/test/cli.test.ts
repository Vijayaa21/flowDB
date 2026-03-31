import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { PostgreSQLForkEngine as ForkEngine } from "@flowdb/core";

import { runCli } from "../src/program";

const describeContainer = process.env.RUN_CONTAINER_TESTS === "1" ? describe : describe.skip;

type SpinnerMock = {
  start: () => SpinnerMock;
  stop: () => SpinnerMock;
  succeed: (_text?: string) => SpinnerMock;
  fail: (_text?: string) => SpinnerMock;
};

function spinnerMock(): SpinnerMock {
  return {
    start() {
      return this;
    },
    stop() {
      return this;
    },
    succeed() {
      return this;
    },
    fail() {
      return this;
    }
  };
}

async function withDbName(connectionString: string, databaseName: string): Promise<string> {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function setupMainDb(maintenanceUrl: string): Promise<string> {
  const dbName = `flowdb_main_${randomUUID().replace(/-/g, "")}`.slice(0, 63);
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
  return withDbName(maintenanceUrl, dbName);
}

async function writeBaseFixture(cwd: string, databaseUrl: string): Promise<void> {
  await mkdir(path.join(cwd, "migrations"), { recursive: true });
  await writeFile(
    path.join(cwd, "migrations", "001_init.sql"),
    "CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);\n",
    "utf8"
  );
  await writeFile(path.join(cwd, "seed.sql"), "INSERT INTO users (email) VALUES ('seed@example.com');\n");
  await writeFile(path.join(cwd, ".flowdb.config.json"), JSON.stringify({ orm: "raw", sourceDatabaseUrl: databaseUrl }));
}

describeContainer("flowdb cli commands", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let maintenanceUrl: string;
  let sourceDatabaseUrl: string;
  let tmpRoot: string;
  let testForkEngine: ForkEngine;
  const outputs: string[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("postgres")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();
    maintenanceUrl = container.getConnectionUri();
    sourceDatabaseUrl = await setupMainDb(maintenanceUrl);
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "flowdb-cli-"));
    testForkEngine = new ForkEngine();
  });

  afterAll(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
    }
    if (container) {
      await container.stop();
    }
  });

  async function run(args: string[], cwd: string) {
    outputs.length = 0;
    await runCli(["node", "flowdb", ...args], {
      cwd: () => cwd,
      env: {
        ...process.env,
        DATABASE_URL: sourceDatabaseUrl
      },
      exit: () => undefined,
      forkEngine: testForkEngine,
      ui: {
        log: (message) => outputs.push(String(message)),
        error: (message) => outputs.push(String(message)),
        spinner: () => spinnerMock() as never
      }
    });
  }

  test("init creates config and .env.local", async () => {
    const cwd = path.join(tmpRoot, "init");
    await mkdir(cwd, { recursive: true });
    await mkdir(path.join(cwd, "migrations"), { recursive: true });
    await writeFile(path.join(cwd, "migrations", "001.sql"), "CREATE TABLE t (id INT);\n", "utf8");

    await run(["init"], cwd);

    const configRaw = await readFile(path.join(cwd, ".flowdb.config.json"), "utf8");
    const envRaw = await readFile(path.join(cwd, ".env.local"), "utf8");
    expect(configRaw).toContain("sourceDatabaseUrl");
    expect(envRaw).toContain("DATABASE_URL=");
  });

  test("branch list shows active branches", async () => {
    const cwd = path.join(tmpRoot, "branch-list");
    await mkdir(cwd, { recursive: true });
    await writeBaseFixture(cwd, sourceDatabaseUrl);

    await testForkEngine.fork(sourceDatabaseUrl, "list-test");

    await run(["branch", "list"], cwd);

    expect(outputs.join("\n")).toContain("flowdb_branch");
    expect(outputs.join("\n")).toContain("status");
  });

  test("branch reset tears down and re-forks", async () => {
    const cwd = path.join(tmpRoot, "branch-reset");
    await mkdir(cwd, { recursive: true });
    await writeBaseFixture(cwd, sourceDatabaseUrl);

    const firstBranch = await testForkEngine.fork(sourceDatabaseUrl, "reset-test");
    const firstName = new URL(firstBranch.branchDatabaseUrl).pathname.replace(/^\//, "");

    await run(["branch", "reset", firstName], cwd);

    const branches = await testForkEngine.listBranches(sourceDatabaseUrl);
    expect(branches.some((branch) => branch.name.includes("reset_test"))).toBe(true);
  });

  test("diff renders schema diff table", async () => {
    const cwd = path.join(tmpRoot, "diff");
    await mkdir(cwd, { recursive: true });
    await writeBaseFixture(cwd, sourceDatabaseUrl);

    const branch = await testForkEngine.fork(sourceDatabaseUrl, "diff-test");
    const branchName = new URL(branch.branchDatabaseUrl).pathname.replace(/^\//, "");

    const branchClient = new Client({ connectionString: branch.branchDatabaseUrl });
    await branchClient.connect();
    await branchClient.query(
      "CREATE TABLE IF NOT EXISTS flowdb_applied_migrations (id TEXT PRIMARY KEY, filename TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await branchClient.query(
      "INSERT INTO flowdb_applied_migrations (id, filename) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      ["raw:migrations/001_init.sql", "migrations/001_init.sql"]
    );
    await branchClient.end();

    await run(["diff", branchName], cwd);

    expect(outputs.join("\n")).toContain("migration");
    expect(outputs.join("\n")).toContain("Summary:");
  });

  test("seed runs sql file against branch", async () => {
    const cwd = path.join(tmpRoot, "seed");
    await mkdir(cwd, { recursive: true });
    await writeBaseFixture(cwd, sourceDatabaseUrl);

    const branch = await testForkEngine.fork(sourceDatabaseUrl, "seed-test");
    const branchName = new URL(branch.branchDatabaseUrl).pathname.replace(/^\//, "");

    const branchClient = new Client({ connectionString: branch.branchDatabaseUrl });
    await branchClient.connect();
    await branchClient.query("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT)");
    await branchClient.end();

    await run(["seed", branchName], cwd);

    const verifyClient = new Client({ connectionString: branch.branchDatabaseUrl });
    await verifyClient.connect();
    const result = await verifyClient.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
    await verifyClient.end();
    expect(result.rows[0]?.count).toBe("1");
  });

  test("status shows branch, db status, pending migrations", async () => {
    const cwd = path.join(tmpRoot, "status");
    await mkdir(cwd, { recursive: true });
    await writeBaseFixture(cwd, sourceDatabaseUrl);

    await run(["status"], cwd);

    const text = outputs.join("\n");
    expect(text).toContain("FlowDB Status");
    expect(text).toContain("db connection:");
    expect(text).toContain("pending migrations:");
  });
});
