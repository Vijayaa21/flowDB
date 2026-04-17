import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApp } from "../src/server";
import { runPendingMigrations } from "../src/migrations";

function jwtToken(secret: string, githubId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const payload = Buffer.from(
    JSON.stringify({ githubId, exp: Math.floor(Date.now() / 1000) + 3600 })
  )
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

function createNodeServerFromHono(app: ReturnType<typeof createApp>) {
  return createServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const requestUrl = `http://127.0.0.1${req.url ?? "/"}`;
      const webRequest = new Request(requestUrl, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body,
      });
      const response = await app.fetch(webRequest);
      res.statusCode = response.status;
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    });
  });
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

describe("branches fork integration", () => {
  const authSecret = "integration-auth-secret";
  const githubId = "integration-user-42";

  let container: StartedPostgreSqlContainer;
  let maintenanceUrl: string;
  let sourceDatabaseUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("postgres")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    maintenanceUrl = container.getConnectionUri();

    const adminClient = new Client({ connectionString: maintenanceUrl });
    await adminClient.connect();
    await adminClient.query('CREATE DATABASE "flowdb_source_main"');
    await adminClient.end();

    sourceDatabaseUrl = withDatabaseName(maintenanceUrl, "flowdb_source_main");

    const sourceClient = new Client({ connectionString: sourceDatabaseUrl });
    await sourceClient.connect();
    await sourceClient.query("CREATE TABLE seed_table(id SERIAL PRIMARY KEY, value TEXT NOT NULL)");
    await sourceClient.query("INSERT INTO seed_table(value) VALUES ('seed')");
    await sourceClient.end();

    process.env.AUTH_SECRET = authSecret;
    process.env.DATABASE_URL = maintenanceUrl;
    process.env.SOURCE_DATABASE_URL = sourceDatabaseUrl;

    await runPendingMigrations({
      databaseUrl: maintenanceUrl,
      migrationsDir: path.resolve(process.cwd(), "migrations"),
    });
  }, 180000);

  afterAll(async () => {
    await container.stop();
  }, 180000);

  test(
    "POST /branches/fork creates real branch DB and GET /branches returns metadata",
    async () => {
      const app = createApp();
      const server = createNodeServerFromHono(app);
      const authHeader = `Bearer ${jwtToken(authSecret, githubId)}`;

      const forkResponse = await request(server)
        .post("/branches/fork")
        .set("authorization", authHeader)
        .send({
          sourceDatabaseUrl,
          branchName: "feature/integration-real-fork",
        });

      expect(forkResponse.status).toBe(201);
      expect(forkResponse.body.branchName).toBe("feature/integration-real-fork");
      expect(forkResponse.body.status).toBe("READY");
      expect(forkResponse.body.ownerGithubId).toBe(githubId);

      const branchUrl = String(forkResponse.body.branchUrl);
      const branchDatabaseName = new URL(branchUrl).pathname.replace(/^\//, "");

      const adminClient = new Client({ connectionString: maintenanceUrl });
      await adminClient.connect();
      const existsResult = await adminClient.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [branchDatabaseName]
      );
      await adminClient.end();

      expect(existsResult.rows[0]?.exists).toBe(true);

      const branchClient = new Client({ connectionString: branchUrl });
      await branchClient.connect();
      const seedResult = await branchClient.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM seed_table WHERE value = 'seed'"
      );
      await branchClient.end();
      expect(seedResult.rows[0]?.count).toBe("1");

      const listResponse = await request(server).get("/branches").set("authorization", authHeader);
      expect(listResponse.status).toBe(200);
      expect(
        listResponse.body.some(
          (branch: { branchName?: string; branchUrl?: string }) =>
            branch.branchName === "feature/integration-real-fork" && branch.branchUrl === branchUrl
        )
      ).toBe(true);
    },
    180000
  );
});
