import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "../src/server";
import type { BranchStateRepository } from "../src/branch-state-repository";
import type { BranchRecord, BranchStatus } from "../src/types";

type BranchStore = Map<string, BranchRecord>;

class InMemoryBranchRepository implements BranchStateRepository {
  private readonly store: BranchStore = new Map();

  public async upsert(record: {
    prNumber: number;
    branchName: string;
    branchDatabaseUrl: string;
    status: BranchStatus;
  }): Promise<void> {
    const now = new Date();
    const existing = this.store.get(record.branchName);
    this.store.set(record.branchName, {
      prNumber: record.prNumber,
      branchName: record.branchName,
      branchDatabaseUrl: record.branchDatabaseUrl,
      status: record.status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  }

  public async getByBranchName(branchName: string): Promise<BranchRecord | null> {
    return this.store.get(branchName) ?? null;
  }

  public async getByPrNumber(prNumber: number): Promise<BranchRecord | null> {
    for (const record of this.store.values()) {
      if (record.prNumber === prNumber) {
        return record;
      }
    }
    return null;
  }

  public async setStatus(branchName: string, status: BranchStatus): Promise<void> {
    const record = this.store.get(branchName);
    if (!record) {
      return;
    }
    this.store.set(branchName, { ...record, status, updatedAt: new Date() });
  }

  public async listActive(): Promise<BranchRecord[]> {
    return [...this.store.values()].filter((record) => record.status !== "closed");
  }
}

function signature(secret: string, payload: unknown): string {
  const raw = JSON.stringify(payload);
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
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
        body
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

describe("orchestrator routes", () => {
  const tasks: Promise<void>[] = [];
  const branchRepo = new InMemoryBranchRepository();
  const forkCalls: string[] = [];
  const teardownCalls: string[] = [];
  const migrationRuns: string[] = [];
  const vercelInjects: Array<{ deploymentId: string; databaseUrl: string }> = [];

  const app = createApp({
    webhookSecret: "test-secret",
    sourceDatabaseUrl: "postgres://postgres:postgres@localhost:5432/postgres",
    projectRoot: process.cwd(),
    version: "test-version",
    branches: branchRepo,
    forkEngine: {
      async fork(_source, branchName) {
        forkCalls.push(branchName);
        return `postgres://branch/${branchName}`;
      },
      async teardown(branchDatabaseUrl) {
        teardownCalls.push(branchDatabaseUrl);
      },
      async listBranches() {
        return [];
      },
      async healthCheck() {
        return true;
      }
    },
    migrationRunner: async (_projectRoot, branchDatabaseUrl) => {
      migrationRuns.push(branchDatabaseUrl);
      return { applied: [] };
    },
    vercel: {
      async injectDeploymentDatabaseUrl(deploymentId, databaseUrl) {
        vercelInjects.push({ deploymentId, databaseUrl });
      }
    },
    scheduleTask: (task) => {
      tasks.push(task());
    }
  });

  const server = createNodeServerFromHono(app);

  afterEach(async () => {
    await Promise.all(tasks.splice(0, tasks.length));
  });

  test("GET /health returns status and version", async () => {
    const response = await request(server).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", version: "test-version" });
  });

  test("POST /webhooks/github validates signature and forks on pull_request.opened", async () => {
    const payload = {
      action: "opened",
      pull_request: { number: 101, head: { ref: "feature/api" } }
    };

    const startedAt = Date.now();
    const response = await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);
    const durationMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThan(500);
    expect(forkCalls).toContain("feature/api");

    const branches = await branchRepo.listActive();
    expect(branches.some((branch) => branch.branchName === "feature/api")).toBe(true);
  });

  test("POST /webhooks/github runs migrations on push", async () => {
    await branchRepo.upsert({
      prNumber: 200,
      branchName: "feature/push",
      branchDatabaseUrl: "postgres://branch/feature/push",
      status: "active"
    });

    const payload = { ref: "refs/heads/feature/push" };
    const response = await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "push")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(migrationRuns).toContain("postgres://branch/feature/push");
  });

  test("POST /webhooks/github tears down branch on pull_request.closed", async () => {
    await branchRepo.upsert({
      prNumber: 300,
      branchName: "feature/close",
      branchDatabaseUrl: "postgres://branch/feature/close",
      status: "active"
    });

    const payload = {
      action: "closed",
      pull_request: { number: 300, head: { ref: "feature/close" } }
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(teardownCalls).toContain("postgres://branch/feature/close");
  });

  test("POST /webhooks/vercel injects DATABASE_URL for preview deployment", async () => {
    await branchRepo.upsert({
      prNumber: 400,
      branchName: "feature/preview",
      branchDatabaseUrl: "postgres://branch/feature/preview",
      status: "active"
    });

    const payload = {
      type: "deployment.ready",
      payload: {
        deployment: {
          id: "dep_123",
          target: "preview",
          meta: {
            githubCommitRef: "feature/preview"
          }
        }
      }
    };

    const response = await request(server).post("/webhooks/vercel").send(payload);

    expect(response.status).toBe(200);
    expect(vercelInjects).toContainEqual({
      deploymentId: "dep_123",
      databaseUrl: "postgres://branch/feature/preview"
    });
  });

  test("GET /branches returns active branches with status", async () => {
    const response = await request(server).get("/branches");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.branches)).toBe(true);
    expect(response.body.branches.every((branch: { status: string }) => !!branch.status)).toBe(true);
  });

  test("POST /webhooks/github rejects invalid signature", async () => {
    const payload = {
      action: "opened",
      pull_request: { number: 999, head: { ref: "feature/bad-signature" } }
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(payload);

    expect(response.status).toBe(401);
  });
});