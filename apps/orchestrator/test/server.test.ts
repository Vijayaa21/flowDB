import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "../src/server";
import type { BranchStateRepository } from "../src/branch-state-repository";
import type { BranchRecord, BranchStatus } from "../src/types";

type ExtendedBranchRecord = BranchRecord & { prNumber?: number | null };
type BranchStore = Map<string, ExtendedBranchRecord>;

function branchKey(ownerGithubId: string, branchName: string): string {
  return `${ownerGithubId}:${branchName}`;
}

class InMemoryBranchRepository implements BranchStateRepository {
  private readonly store: BranchStore = new Map();

  public async create(
    ownerGithubId: string,
    record: {
      branchName: string;
      sourceUrl: string;
      branchUrl: string;
      status: BranchStatus;
    }
  ): Promise<BranchRecord> {
    const now = new Date();
    const key = branchKey(ownerGithubId, record.branchName);
    const existing = this.store.get(key);
    const created: ExtendedBranchRecord = {
      id: existing?.id ?? String(this.store.size + 1),
      branchName: record.branchName,
      sourceUrl: record.sourceUrl,
      branchUrl: record.branchUrl,
      status: record.status,
      ownerGithubId,
      createdAt: existing?.createdAt ?? now,
      prNumber: existing?.prNumber ?? null,
    };
    this.store.set(key, created);
    return created;
  }

  public reset(): void {
    this.store.clear();
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
    await this.create(ownerGithubId, {
      branchName: record.branchName,
      sourceUrl: record.sourceUrl,
      branchUrl: record.branchUrl,
      status: record.status,
    });

    const key = branchKey(ownerGithubId, record.branchName);
    const existing = this.store.get(key);
    if (existing) {
      this.store.set(key, {
        ...existing,
        prNumber: record.prNumber ?? null,
      });
    }
  }

  public async getByBranchName(
    ownerGithubId: string,
    branchName: string
  ): Promise<BranchRecord | null> {
    return this.store.get(branchKey(ownerGithubId, branchName)) ?? null;
  }

  public async getByPrNumber(
    ownerGithubId: string,
    prNumber: number
  ): Promise<BranchRecord | null> {
    for (const [key, record] of this.store.entries()) {
      if (key.startsWith(`${ownerGithubId}:`) && record.prNumber === prNumber) {
        return record;
      }
    }
    return null;
  }

  public async setStatus(
    ownerGithubId: string,
    branchName: string,
    status: BranchStatus
  ): Promise<void> {
    const key = branchKey(ownerGithubId, branchName);
    const record = this.store.get(key);
    if (!record) {
      return;
    }
    this.store.set(key, { ...record, status });
  }

  public async listActive(ownerGithubId: string): Promise<BranchRecord[]> {
    return [...this.store.entries()]
      .filter(
        ([key, record]) => key.startsWith(`${ownerGithubId}:`) && record.status !== "TORN_DOWN"
      )
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
          durationMs: 10,
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
      },
    },
    migrationRunner: async (_projectRoot, branchDatabaseUrl) => {
      migrationRuns.push(branchDatabaseUrl);
      return {
        applied: [],
        pending: [],
        schemaDiffSummary: "No migrations were applied.",
        conflicts: [],
      };
    },
    vercel: {
      async injectDeploymentDatabaseUrl(deploymentId, databaseUrl) {
        vercelInjects.push({ deploymentId, databaseUrl });
      },
    },
    scheduleTask: (task) => {
      tasks.push(task());
    },
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
    const response = await request(server).get("/health").set("x-request-id", "req-health-echo-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("req-health-echo-1");
    expect(response.body.requestId).toBe("req-health-echo-1");
  });

  test("GET / returns service metadata", async () => {
    const response = await request(server).get("/").set("x-request-id", "req-root-1");

    expect(response.status).toBe(200);
    expect(response.body.service).toBe("flowdb-orchestrator");
    expect(response.body.status).toBe("ok");
    expect(response.body.version).toBe("test-version");
    expect(response.body.requestId).toBe("req-root-1");
    expect(response.body.endpoints).toEqual({
      health: "/health",
      metrics: "/metrics",
      branches: "/branches",
    });
  });

  test("GET /metrics returns baseline request metrics", async () => {
    await request(server).get("/health");
    await request(server).get("/health");

    const response = await request(server).get("/metrics").set("x-request-id", "req-metrics-1");

    expect(response.status).toBe(200);
    expect(response.body.totalRequests).toBeGreaterThanOrEqual(3);
    expect(response.body.byMethod.GET).toBeGreaterThanOrEqual(3);
    expect(response.body.byStatusClass["2xx"]).toBeGreaterThanOrEqual(3);
    expect(response.body.byPath["GET /health"]).toBeGreaterThanOrEqual(2);
    expect(response.body.webhooks.githubTotal).toBe(0);
    expect(response.body.webhooks.vercelTotal).toBe(0);
    expect(response.body.backgroundTasks.scheduled).toBe(0);
    expect(response.body.backgroundTasks.succeeded).toBe(0);
    expect(response.body.requestId).toBe("req-metrics-1");
    expect(response.headers["x-request-id"]).toBe("req-metrics-1");
  });

  test("GET /metrics captures webhook and background task counters", async () => {
    const pullRequestPayload = {
      action: "opened",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 777, head: { ref: "feature/metrics" } },
    };

    const invalidPayload = {
      action: "opened",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 778, head: { ref: "feature/invalid" } },
    };

    const vercelPayload = {
      type: "deployment.ready",
      payload: {
        deployment: {
          id: "dep_metrics_1",
          target: "preview",
          meta: {
            githubOwner: "12345",
            githubCommitRef: "feature/metrics",
          },
        },
      },
    };

    await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-metrics-open-777")
      .set("x-hub-signature-256", signature("test-secret", pullRequestPayload))
      .send(pullRequestPayload);

    await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-metrics-open-777")
      .set("x-hub-signature-256", signature("test-secret", pullRequestPayload))
      .send(pullRequestPayload);

    await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-metrics-invalid-778")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(invalidPayload);

    await request(server)
      .post("/webhooks/vercel")
      .send(vercelPayload);

    const response = await request(server).get("/metrics").set("x-request-id", "req-metrics-2");

    expect(response.status).toBe(200);
    expect(response.body.webhooks.githubTotal).toBeGreaterThanOrEqual(3);
    expect(response.body.webhooks.githubByEvent.pull_request).toBeGreaterThanOrEqual(3);
    expect(response.body.webhooks.githubByAction.opened).toBeGreaterThanOrEqual(1);
    expect(response.body.webhooks.githubDuplicates).toBeGreaterThanOrEqual(1);
    expect(response.body.webhooks.githubInvalidSignatures).toBeGreaterThanOrEqual(1);
    expect(response.body.webhooks.vercelTotal).toBeGreaterThanOrEqual(1);
    expect(response.body.webhooks.vercelPreviewReady).toBeGreaterThanOrEqual(1);
    expect(response.body.backgroundTasks.scheduled).toBeGreaterThanOrEqual(2);
    expect(response.body.backgroundTasks.succeeded).toBeGreaterThanOrEqual(2);
    expect(response.body.backgroundTasks.failed).toBe(0);
    expect(
      response.body.backgroundTasks.byName["github.pull_request.open_or_reopen"]
    ).toBeGreaterThanOrEqual(1);
    expect(
      response.body.backgroundTasks.byName["vercel.deployment.ready.preview"]
    ).toBeGreaterThanOrEqual(1);
    expect(response.body.requestId).toBe("req-metrics-2");
  });

  test("POST /webhooks/github validates signature and forks on pull_request.opened", async () => {
    const payload = {
      action: "opened",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 101, head: { ref: "feature/api" } },
    };

    const startedAt = Date.now();
    const response = await request(server)
      .post("/webhooks/github")
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
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/old-feature/reopen",
      status: "TORN_DOWN",
    });

    const payload = {
      action: "reopened",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 150, head: { ref: "feature/reopen" } },
    };

    const response = await request(server)
      .post("/webhooks/github")
      .set("x-github-event", "pull_request")
      .set("x-github-delivery", "del-reopen-150")
      .set("x-hub-signature-256", signature("test-secret", payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(forkCalls).toContain("feature/reopen");

    const reopened = await branchRepo.getByBranchName("12345", "feature/reopen");
    expect(reopened?.status).toBe("READY");
    expect(reopened?.branchUrl).toBe("postgres://branch/feature/reopen");
  });

  test("POST /webhooks/github ignores duplicate delivery for active branch", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 160,
      branchName: "feature/dupe",
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/feature/dupe",
      status: "READY",
    });

    const payload = {
      action: "opened",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 160, head: { ref: "feature/dupe" } },
    };

    const response = await request(server)
      .post("/webhooks/github")
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
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/feature/push",
      status: "READY",
    });

    const payload = {
      ref: "refs/heads/feature/push",
      repository: { name: "flowdb", owner: { login: "12345" } },
    };
    const response = await request(server)
      .post("/webhooks/github")
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
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/feature/close",
      status: "READY",
    });

    const payload = {
      action: "closed",
      repository: { owner: { login: "12345" } },
      pull_request: { number: 300, head: { ref: "feature/close" } },
    };

    const response = await request(server)
      .post("/webhooks/github")
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
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/feature/preview",
      status: "READY",
    });

    const payload = {
      type: "deployment.ready",
      payload: {
        deployment: {
          id: "dep_123",
          target: "preview",
          meta: {
            githubOwner: "12345",
            githubCommitRef: "feature/preview",
          },
        },
      },
    };

    const response = await request(server)
      .post("/webhooks/vercel")
      .send(payload);

    expect(response.status).toBe(200);
    expect(vercelInjects).toContainEqual({
      deploymentId: "dep_123",
      databaseUrl: "postgres://branch/feature/preview",
    });
  });

  test("GET /branches requires token and returns scoped data when authorized", async () => {
    const unauthorized = await request(server).get("/branches");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ error: "Unauthorized" });

    const authorized = await request(server).get("/branches").set("authorization", authHeader);
    expect(authorized.status).toBe(200);
    expect(authorized.body).toEqual([]);
  });

  test("POST /branches/fork creates metadata record and GET /branches returns it", async () => {
    const createResponse = await request(server)
      .post("/branches/fork")
      .set("authorization", authHeader)
      .send({
        sourceDatabaseUrl: "postgres://postgres:postgres@localhost:5432/source_db",
        branchName: "feature/manual-fork",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.branchName).toBe("feature/manual-fork");
    expect(createResponse.body.status).toBe("READY");
    expect(createResponse.body.ownerGithubId).toBe("12345");

    const listResponse = await request(server).get("/branches").set("authorization", authHeader);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].branchName).toBe("feature/manual-fork");
  });

  test("GET /branches/:branchName returns single branch with all fields", async () => {
    await request(server)
      .post("/branches/fork")
      .set("authorization", authHeader)
      .send({
        sourceDatabaseUrl: "postgres://postgres:postgres@localhost:5432/source_db",
        branchName: "feature/single-lookup",
      });

    const response = await request(server)
      .get("/branches/feature%2Fsingle-lookup")
      .set("authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.branchName).toBe("feature/single-lookup");
    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("sourceUrl");
    expect(response.body).toHaveProperty("branchUrl");
    expect(response.body).toHaveProperty("status", "READY");
    expect(response.body).toHaveProperty("ownerGithubId", "12345");
    expect(response.body).toHaveProperty("createdAt");
  });

  test("DELETE /branches/:name tears down and closes branch", async () => {
    await branchRepo.upsert("12345", {
      prNumber: 500,
      branchName: "feature/delete",
      sourceUrl: "postgres://source",
      branchUrl: "postgres://branch/feature/delete",
      status: "READY",
    });

    const response = await request(server)
      .delete("/branches/feature%2Fdelete")
      .set("authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(teardownCalls).toContain("postgres://branch/feature/delete");

    const updated = await branchRepo.getByBranchName("12345", "feature/delete");
    expect(updated?.status).toBe("TORN_DOWN");
  });

  test("POST /webhooks/github rejects invalid signature", async () => {
    const payload = {
      action: "opened",
      pull_request: { number: 999, head: { ref: "feature/bad-signature" } },
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
      repository: { owner: { login: "12345" } },
      pull_request: { number: 610, head: { ref: "feature/replay" } },
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
