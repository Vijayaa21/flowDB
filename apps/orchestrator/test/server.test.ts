import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "../src/server";
import type { BranchStateRepository } from "../src/branch-state-repository";
import type { BranchRecord, BranchStatus } from "../src/types";

type BranchStore = Map<string, BranchRecord>;

function branchKey(ownerGithubId: string, branchName: string): string {
  return `${ownerGithubId}:${branchName}`;
}

class InMemoryBranchRepository implements BranchStateRepository {
  private readonly store: BranchStore = new Map();

  public reset(): void {
    this.store.clear();
  }

  public async upsert(ownerGithubId: string, record: {
    prNumber: number;
    branchName: string;
    branchDatabaseUrl: string;
    status: BranchStatus;
  }): Promise<void> {
    const now = new Date();
    const key = branchKey(ownerGithubId, record.branchName);
    const existing = this.store.get(key);
    this.store.set(key, {
      prNumber: record.prNumber,
      branchName: record.branchName,
      branchDatabaseUrl: record.branchDatabaseUrl,
      status: record.status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  }

  public async getByBranchName(ownerGithubId: string, branchName: string): Promise<BranchRecord | null> {
    return this.store.get(branchKey(ownerGithubId, branchName)) ?? null;
  }

  public async getByPrNumber(ownerGithubId: string, prNumber: number): Promise<BranchRecord | null> {
    for (const [key, record] of this.store.entries()) {
      if (key.startsWith(`${ownerGithubId}:`) && record.prNumber === prNumber) {
        return record;
      }
    }
    return null;
  }

  public async setStatus(ownerGithubId: string, branchName: string, status: BranchStatus): Promise<void> {
    const key = branchKey(ownerGithubId, branchName);
    const record = this.store.get(key);
    if (!record) {
      return;
    }
    this.store.set(key, { ...record, status, updatedAt: new Date() });
  }

  public async listActive(ownerGithubId: string): Promise<BranchRecord[]> {
    return [...this.store.entries()]
      .filter(([key, record]) => key.startsWith(`${ownerGithubId}:`) && record.status !== "closed")
      .map(([, record]) => record);
  }
}

function signature(secret: string, payload: unknown): string {
  const raw = JSON.stringify(payload);
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

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
  process.env.AUTH_SECRET = "test-auth-secret";
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
        return {
          branchDatabaseUrl: `postgres://branch/${branchName}`,
          branchName,
          forkedAt: new Date(),
          durationMs: 10
        };
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
      return {
        applied: [],
        pending: [],
        schemaDiffSummary: "No migrations were applied.",
        conflicts: []
      };
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
  const authHeader = `Bearer ${jwtToken("test-auth-secret", "12345")}`;

  afterEach(async () => {
    await Promise.all(tasks.splice(0, tasks.length));
    branchRepo.reset();
  });

  test("GET /health returns status and version", async () => {
    const response = await request(server).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(typeof response.body.requestId).toBe("string");
    expect(response.body.version).toBe("test-version");
    expect(typeof response.body.timestamp).toBe("string");
    expect(typeof response.headers["x-request-id"]).toBe("string");
  });

  test("GET /health echoes incoming request id", async () => {
    const response = await request(server)
      .get("/health")
      .set("x-request-id", "req-health-echo-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("req-health-echo-1");
    expect(response.body.requestId).toBe("req-health-echo-1");
  });

  test("GET /metrics returns baseline request metrics", async () => {
    await request(server).get("/health");
    await request(server).get("/health");

    const response = await request(server)
      .get("/metrics")
      .set("x-request-id", "req-metrics-1");

    expect(response.status).toBe(200);
    expect(response.body.totalRequests).toBeGreaterThanOrEqual(3);
    expect(response.body.byMethod.GET).toBeGreaterThanOrEqual(3);
    expect(response.body.byPath["GET /health"]).toBeGreaterThanOrEqual(2);
    expect(response.body.requestId).toBe("req-metrics-1");
    expect(response.headers["x-request-id"]).toBe("req-metrics-1");
  });

  test("POST /webhooks/github validates signature and forks on pull_request.opened", async () => {
    const payload = {
      action: "opened",
      pull_request: { number: 101, head: { ref: "feature/api" } }
    };

    const startedAt = Date.now();
    const response = await request(server)
      .post("/webhooks/github")
      .set("authorization", authHeader)
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-open-101")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);
    const durationMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThan(500);
    expect(forkCalls).toContain("feature/api");

    const branches = await branchRepo.listActive("12345");
    expect(branches.some((branch) => branch.branchName === "feature/api")).toBe(true);
  });

  test("POST /webhooks/github re-forks on pull_request.reopened for previously closed branch", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 150,
      branchName: "feature/reopen",
      branchDatabaseUrl: "postgres://branch/old-feature/reopen",
      status: "closed"
    });

    const payload = {
      action: "reopened",
      pull_request: { number: 150, head: { ref: "feature/reopen" } }
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("authorization", authHeader)
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-reopen-150")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(forkCalls).toContain("feature/reopen");

    const reopened = await branchRepo.getByBranchName("12345", "feature/reopen");
    expect(reopened?.status).toBe("active");
    expect(reopened?.branchDatabaseUrl).toBe("postgres://branch/feature/reopen");
  });

  test("POST /webhooks/github ignores duplicate delivery for active branch", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 160,
      branchName: "feature/dupe",
      branchDatabaseUrl: "postgres://branch/feature/dupe",
      status: "active"
    });

    const payload = {
      action: "opened",
      pull_request: { number: 160, head: { ref: "feature/dupe" } }
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("authorization", authHeader)
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-dupe-160")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    const duplicateForkCalls = forkCalls.filter((name) => name === "feature/dupe");
    expect(duplicateForkCalls.length).toBe(0);
  });

  test("POST /webhooks/github runs migrations on push", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 200,
      branchName: "feature/push",
      branchDatabaseUrl: "postgres://branch/feature/push",
      status: "active"
    });

    const payload = { ref: "refs/heads/feature/push" };
    const response = await request(server)
      .post("/webhooks/github")
      .set("authorization", authHeader)
      .set("x-github-event", "push")
      .set("x-github-delivery", "del-push-200")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(migrationRuns).toContain("postgres://branch/feature/push");
  });

  test("POST /webhooks/github tears down branch on pull_request.closed", async () => {
    await branchRepo.upsert("12345", {
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
      .set("authorization", authHeader)
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-close-300")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(teardownCalls).toContain("postgres://branch/feature/close");
  });

  test("POST /webhooks/vercel injects DATABASE_URL for preview deployment", async () => {
    await branchRepo.upsert("12345", {
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

    const response = await request(server)
      .post("/webhooks/vercel")
      .set("authorization", authHeader)
      .send(payload);

    expect(response.status).toBe(200);
    expect(vercelInjects).toContainEqual({
      deploymentId: "dep_123",
      databaseUrl: "postgres://branch/feature/preview"
    });
  });

  test("GET /branches requires token and returns scoped data when authorized", async () => {
    const unauthorized = await request(server).get("/branches");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ error: "Unauthorized" });

    const authorized = await request(server)
      .get("/branches")
      .set("authorization", authHeader);
    expect(authorized.status).toBe(200);
    expect(authorized.body).toEqual([]);
  });

  test("DELETE /branches/:name tears down and closes branch", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 500,
      branchName: "feature/delete",
      branchDatabaseUrl: "postgres://branch/feature/delete",
      status: "active"
    });

    const response = await request(server)
      .delete("/branches/feature%2Fdelete")
      .set("authorization", authHeader);

    expect(response.status).toBe(204);
    expect(teardownCalls).toContain("postgres://branch/feature/delete");

    const updated = await branchRepo.getByBranchName("12345", "feature/delete");
    expect(updated?.status).toBe("closed");
  });

  test("POST /webhooks/github rejects invalid signature", async () => {
    const payload = {
      action: "opened",
      pull_request: { number: 999, head: { ref: "feature/bad-signature" } }
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("authorization", authHeader)
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-invalid-999")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(payload);

    expect(response.status).toBe(401);
  });
    
    test("POST /webhooks/github ignores replayed delivery ids", async () => {
      const payload = {
        action: "opened",
        pull_request: { number: 610, head: { ref: "feature/replay" } }
      };
    
      const first = await request(server)
        .post("/webhooks/github")
        .set("authorization", authHeader)
        .set("x-github-event", "pull_request")
        .set("x-github-delivery", "del-replay-610")
        .set("x-hub-signature-256", signature("test-secret", payload))
        .send(payload);
    
      const second = await request(server)
        .post("/webhooks/github")
        .set("authorization", authHeader)
        .set("x-github-event", "pull_request")
        .set("x-github-delivery", "del-replay-610")
        .set("x-hub-signature-256", signature("test-secret", payload))
        .send(payload);
    
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ accepted: true, ignored: true, reason: "duplicate_delivery" });
      expect(forkCalls.filter((name) => name === "feature/replay")).toHaveLength(1);
    });
});