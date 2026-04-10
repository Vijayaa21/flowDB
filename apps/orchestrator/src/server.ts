import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";

import { PostgreSQLForkEngine, type BranchInfo, type ForkResult } from "@flowdb/core";

import {
  NoopGithubCommentPublisher,
  OctokitGithubCommentPublisher,
  type GithubCommentPublisher
} from "./github-pr-comments";
import {
  PostgresBranchStateRepository,
  type BranchStateRepository
} from "./branch-state-repository";
import { runPendingMigrations, type MigrationRunReport } from "./migration-runner";
import { githubPullRequestSchema, githubPushSchema, vercelWebhookSchema } from "./schemas";
import { verifyGithubSignature } from "./security";
import { VercelSdkClient, type VercelClient } from "./vercel-client";
import { getConfig } from "./config";
import { authMiddleware } from "./middleware/auth";

type ForkEngine = {
  fork(sourceDatabaseUrl: string, branchName: string): Promise<ForkResult>;
  teardown(branchDatabaseUrl: string): Promise<void>;
  listBranches(hostUrl: string): Promise<BranchInfo[]>;
  healthCheck(databaseUrl: string): Promise<boolean>;
};

type WebhookReplayCache = {
  has(deliveryId: string): boolean;
  record(deliveryId: string): void;
};

const WEBHOOK_REPLAY_WINDOW_MS = 10 * 60 * 1000;

function createInMemoryWebhookReplayCache(): WebhookReplayCache {
  const deliveries = new Map<string, number>();

  const pruneExpired = (): void => {
    const now = Date.now();
    for (const [deliveryId, seenAt] of deliveries.entries()) {
      if (now - seenAt > WEBHOOK_REPLAY_WINDOW_MS) {
        deliveries.delete(deliveryId);
      }
    }
  };

  return {
    has(deliveryId: string): boolean {
      pruneExpired();
      return deliveries.has(deliveryId);
    },
    record(deliveryId: string): void {
      pruneExpired();
      deliveries.set(deliveryId, Date.now());
    }
  };
}

type OrchestratorDependencies = {
  forkEngine: ForkEngine;
  branches: BranchStateRepository;
  vercel: VercelClient;
  githubComments: GithubCommentPublisher;
  webhookReplayCache: WebhookReplayCache;
  migrationRunner: (projectRoot: string, branchDatabaseUrl: string) => Promise<MigrationRunReport>;
  webhookSecret: string;
  sourceDatabaseUrl: string;
  projectRoot: string;
  version: string;
  scheduleTask: (task: () => Promise<void>) => void;
};

type RequestMetrics = {
  startedAt: number;
  totalRequests: number;
  totalDurationMs: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  byStatusClass: Record<string, number>;
  byPath: Record<string, number>;
};

type WebhookMetrics = {
  githubTotal: number;
  githubDuplicates: number;
  githubInvalidSignatures: number;
  githubInvalidPayloads: number;
  githubByEvent: Record<string, number>;
  githubByAction: Record<string, number>;
  vercelTotal: number;
  vercelInvalidPayloads: number;
  vercelPreviewReady: number;
};

type BackgroundTaskMetrics = {
  scheduled: number;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
  byName: Record<string, number>;
};

function createRequestMetrics(): RequestMetrics {
  return {
    startedAt: Date.now(),
    totalRequests: 0,
    totalDurationMs: 0,
    byMethod: {},
    byStatus: {},
    byStatusClass: {},
    byPath: {}
  };
}

function createWebhookMetrics(): WebhookMetrics {
  return {
    githubTotal: 0,
    githubDuplicates: 0,
    githubInvalidSignatures: 0,
    githubInvalidPayloads: 0,
    githubByEvent: {},
    githubByAction: {},
    vercelTotal: 0,
    vercelInvalidPayloads: 0,
    vercelPreviewReady: 0
  };
}

function createBackgroundTaskMetrics(): BackgroundTaskMetrics {
  return {
    scheduled: 0,
    succeeded: 0,
    failed: 0,
    totalDurationMs: 0,
    byName: {}
  };
}

function incrementCounter(store: Record<string, number>, key: string): void {
  store[key] = (store[key] ?? 0) + 1;
}

function getRequestId(headerValue: string | undefined): string {
  const trimmed = headerValue?.trim();
  if (trimmed && trimmed.length <= 128) {
    return trimmed;
  }
  return randomUUID();
}

class NoopVercelClient implements VercelClient {
  public async injectDeploymentDatabaseUrl(): Promise<void> {
    return;
  }
}

function createDefaultDependencies(): OrchestratorDependencies {
  const config = getConfig();
  const hasDatabase = Boolean(config.databaseUrl);
  const hasVercelToken = Boolean(config.vercelApiToken);
  const githubToken = process.env.GITHUB_TOKEN;

  return {
    forkEngine: new PostgreSQLForkEngine(),
    branches: new PostgresBranchStateRepository(config.sourceDatabaseUrl),
    vercel: hasVercelToken ? new VercelSdkClient(config.vercelApiToken!) : new NoopVercelClient(),
    githubComments: githubToken
      ? new OctokitGithubCommentPublisher(githubToken)
      : new NoopGithubCommentPublisher(),
    webhookReplayCache: createInMemoryWebhookReplayCache(),
    migrationRunner: runPendingMigrations,
    webhookSecret: config.githubWebhookSecret ?? "",
    sourceDatabaseUrl: config.sourceDatabaseUrl,
    projectRoot: config.projectRoot,
    version: config.version,
    scheduleTask: (task) => {
      setTimeout(() => {
        void task();
      }, 0);
    }
  };
}

function toBranchName(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

function parseJsonSafely<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createApp(partialDeps?: Partial<OrchestratorDependencies>): Hono<{
  Variables: { githubId: string; requestId: string };
}> {
  const defaults = partialDeps ? undefined : createDefaultDependencies();
  const deps: OrchestratorDependencies = {
    ...(defaults ?? {
      forkEngine: partialDeps?.forkEngine as ForkEngine,
      branches: partialDeps?.branches as BranchStateRepository,
      vercel: partialDeps?.vercel as VercelClient,
      githubComments: partialDeps?.githubComments ?? new NoopGithubCommentPublisher(),
      webhookReplayCache: partialDeps?.webhookReplayCache ?? createInMemoryWebhookReplayCache(),
      migrationRunner: partialDeps?.migrationRunner ?? runPendingMigrations,
      webhookSecret: partialDeps?.webhookSecret ?? "",
      sourceDatabaseUrl: partialDeps?.sourceDatabaseUrl ?? "",
      projectRoot: partialDeps?.projectRoot ?? process.cwd(),
      version: partialDeps?.version ?? "0.1.0",
      scheduleTask:
        partialDeps?.scheduleTask ??
        ((task) => {
          setTimeout(() => {
            void task();
          }, 0);
        })
    }),
    ...partialDeps
  } as OrchestratorDependencies;

  const app = new Hono<{ Variables: { githubId: string; requestId: string } }>();
  const metrics = createRequestMetrics();
  const webhookMetrics = createWebhookMetrics();
  const backgroundTaskMetrics = createBackgroundTaskMetrics();

  const runBackgroundTask = (name: string, task: () => Promise<void>): void => {
    backgroundTaskMetrics.scheduled += 1;
    incrementCounter(backgroundTaskMetrics.byName, name);

    deps.scheduleTask(async () => {
      const startedAt = performance.now();
      try {
        await task();
        backgroundTaskMetrics.succeeded += 1;
      } catch (error) {
        backgroundTaskMetrics.failed += 1;
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            event: "background_task_failed",
            taskName: name,
            error: error instanceof Error ? error.message : "Unknown error"
          })
        );
      } finally {
        backgroundTaskMetrics.totalDurationMs +=
          Math.round((performance.now() - startedAt) * 100) / 100;
      }
    });
  };

  app.use(
    "/*",
    cors({
      origin: ["http://localhost:4010", "http://localhost:3001"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"]
    })
  );

  app.use("/*", async (c, next) => {
    const startedAt = performance.now();
    const requestId = getRequestId(c.req.header("x-request-id"));
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);

    try {
      await next();
    } finally {
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const method = c.req.method;
      const path = c.req.path;
      const status = c.res.status;

      metrics.totalRequests += 1;
      metrics.totalDurationMs += durationMs;
      incrementCounter(metrics.byMethod, method);
      incrementCounter(metrics.byStatus, String(status));
      incrementCounter(metrics.byStatusClass, `${Math.floor(status / 100)}xx`);
      incrementCounter(metrics.byPath, `${method} ${path}`);

      const githubId = (c.get("githubId") as string | undefined) ?? "anonymous";
      const orgSlug = c.req.header("x-org-slug") ?? "";
      const projectSlug = c.req.header("x-project-slug") ?? "";
      const environment = c.req.header("x-flowdb-environment") ?? "";

      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "http_request",
          requestId,
          method,
          path,
          status,
          durationMs,
          githubId,
          orgSlug,
          projectSlug,
          environment
        })
      );
    }
  });

  app.get("/health", (c) => {
    return c.json(
      {
        status: "ok",
        requestId: c.get("requestId") as string,
        version: deps.version,
        timestamp: new Date().toISOString()
      },
      200
    );
  });

  app.get("/metrics", (c) => {
    const avgDurationMs = metrics.totalRequests > 0 ? metrics.totalDurationMs / metrics.totalRequests : 0;

    return c.json(
      {
        startedAt: new Date(metrics.startedAt).toISOString(),
        uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
        totalRequests: metrics.totalRequests,
        avgDurationMs: Math.round(avgDurationMs * 100) / 100,
        byMethod: metrics.byMethod,
        byStatus: metrics.byStatus,
        byStatusClass: metrics.byStatusClass,
        byPath: metrics.byPath,
        webhooks: webhookMetrics,
        backgroundTasks: {
          ...backgroundTaskMetrics,
          avgDurationMs:
            backgroundTaskMetrics.scheduled > 0
              ? Math.round((backgroundTaskMetrics.totalDurationMs / backgroundTaskMetrics.scheduled) * 100) /
                100
              : 0
        },
        requestId: c.get("requestId") as string
      },
      200
    );
  });

  app.use("/*", authMiddleware);

  app.get("/branches", async (c) => {
    const githubId = c.get("githubId") as string;
    try {
      const branches = await deps.branches.listActive(githubId);
      return c.json(branches, 200);
    } catch {
      return c.json([], 200);
    }
  });

  app.get("/branches/:name", async (c) => {
    const githubId = c.get("githubId") as string;
    const name = c.req.param("name");
    const branch = await deps.branches.getByBranchName(githubId, name);
    if (!branch) {
      return c.json({ error: `Branch "${name}" not found.` }, 404);
    }
    return c.json(branch);
  });

  app.delete("/branches/:name", async (c) => {
    const githubId = c.get("githubId") as string;
    const name = c.req.param("name");
    const branch = await deps.branches.getByBranchName(githubId, name);

    if (!branch) {
      return c.json({ error: `Branch "${name}" not found.` }, 404);
    }

    await deps.forkEngine.teardown(branch.branchDatabaseUrl);
    await deps.branches.setStatus(githubId, name, "closed");
    return c.body(null, 204);
  });

  app.post("/webhooks/github", async (c) => {
    webhookMetrics.githubTotal += 1;
    const event = c.req.header("x-github-event");
    const signature = c.req.header("x-hub-signature-256");
    const deliveryId = c.req.header("x-github-delivery")?.trim();

    if (event) {
      incrementCounter(webhookMetrics.githubByEvent, event);
    }

    if (!event || !signature || !deliveryId) {
      return c.json({ error: "Missing GitHub webhook headers." }, 400);
    }

    if (deps.webhookReplayCache.has(deliveryId)) {
      webhookMetrics.githubDuplicates += 1;
      return c.json({ accepted: true, ignored: true, reason: "duplicate_delivery" }, 200);
    }

    const rawBody = await c.req.text();
    if (!verifyGithubSignature(rawBody, signature, deps.webhookSecret)) {
      webhookMetrics.githubInvalidSignatures += 1;
      return c.json({ error: "Invalid signature." }, 401);
    }

    const json = parseJsonSafely<unknown>(rawBody);
    if (!json) {
      return c.json({ error: "Invalid JSON body." }, 400);
    }

    deps.webhookReplayCache.record(deliveryId);

    if (event === "pull_request") {
      const parsed = githubPullRequestSchema.safeParse(json);
      if (!parsed.success) {
        webhookMetrics.githubInvalidPayloads += 1;
        return c.json({ error: "Invalid pull_request payload." }, 400);
      }

      const payload = parsed.data;
      incrementCounter(webhookMetrics.githubByAction, payload.action);
      const githubId = c.get("githubId") as string;
      if (payload.action === "opened" || payload.action === "reopened") {
        runBackgroundTask("github.pull_request.open_or_reopen", async () => {
          const byPr = await deps.branches.getByPrNumber(githubId, payload.pull_request.number);
          const byBranch = await deps.branches.getByBranchName(githubId, payload.pull_request.head.ref);
          const existing = byPr ?? byBranch;

          // Ignore duplicate delivery for already-active branch records.
          if (existing && existing.status !== "closed") {
            return;
          }

          const branchDatabaseUrl = await deps.forkEngine.fork(
            deps.sourceDatabaseUrl,
            payload.pull_request.head.ref
          );
          await deps.branches.upsert(githubId, {
            prNumber: payload.pull_request.number,
            branchName: payload.pull_request.head.ref,
            branchDatabaseUrl: branchDatabaseUrl.branchDatabaseUrl,
            status: "active"
          });
        });
      }

      if (payload.action === "closed") {
        runBackgroundTask("github.pull_request.closed", async () => {
          const existing = await deps.branches.getByPrNumber(githubId, payload.pull_request.number);
          const target =
            existing ?? (await deps.branches.getByBranchName(githubId, payload.pull_request.head.ref));
          if (!target) {
            return;
          }
          await deps.forkEngine.teardown(target.branchDatabaseUrl);
          await deps.branches.setStatus(githubId, target.branchName, "closed");
        });
      }

      return c.json({ accepted: true }, 200);
    }

    if (event === "push") {
      const parsed = githubPushSchema.safeParse(json);
      if (!parsed.success) {
        webhookMetrics.githubInvalidPayloads += 1;
        return c.json({ error: "Invalid push payload." }, 400);
      }

      runBackgroundTask("github.push", async () => {
        const githubId = c.get("githubId") as string;
        const branchName = toBranchName(parsed.data.ref);
        const branch = await deps.branches.getByBranchName(githubId, branchName);
        if (!branch) {
          return;
        }
        const owner = parsed.data.repository?.owner.login;
        const repo = parsed.data.repository?.name;

        await deps.branches.setStatus(githubId, branchName, "migrating");
        let report: MigrationRunReport = {
          applied: [],
          pending: [],
          schemaDiffSummary: "No migrations were applied.",
          conflicts: []
        };
        let status = "active";

        try {
          report = await deps.migrationRunner(deps.projectRoot, branch.branchDatabaseUrl);
          await deps.branches.setStatus(githubId, branchName, "active");
          status = "active";
        } catch {
          await deps.branches.setStatus(githubId, branchName, "error");
          status = "error";
        }

        if (owner && repo) {
          await deps.githubComments.upsertReconcileComment({
            owner,
            repo,
            branchName,
            data: {
              branchName,
              branchDbStatus: status,
              pendingMigrations: report.pending,
              schemaDiffSummary: report.schemaDiffSummary,
              conflicts: report.conflicts
            }
          });
        }
      });

      return c.json({ accepted: true }, 200);
    }

    return c.json({ accepted: true, ignored: true }, 200);
  });

  app.post("/webhooks/vercel", async (c) => {
    webhookMetrics.vercelTotal += 1;
    const json = await c.req.json();
    const parsed = vercelWebhookSchema.safeParse(json);

    if (!parsed.success) {
      webhookMetrics.vercelInvalidPayloads += 1;
      return c.json({ error: "Invalid Vercel payload." }, 400);
    }

    const payload = parsed.data;
    const deployment = payload.payload?.deployment;

    if (payload.type === "deployment.ready" && deployment?.target === "preview") {
      webhookMetrics.vercelPreviewReady += 1;
      runBackgroundTask("vercel.deployment.ready.preview", async () => {
        const githubId = c.get("githubId") as string;
        const branchName = (deployment.meta?.githubCommitRef ?? payload.payload?.git?.branch) as string | undefined;
        const branch = branchName ? await deps.branches.getByBranchName(githubId, branchName as string) : null;
        const databaseUrl = branch?.branchDatabaseUrl ?? deps.sourceDatabaseUrl;
        if (deployment.id) {
          await deps.vercel.injectDeploymentDatabaseUrl(deployment.id as string, databaseUrl);
        }
      });
    }

    return c.json({ accepted: true }, 200);
  });

  return app;
}