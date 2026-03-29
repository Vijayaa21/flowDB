import { Hono } from "hono";
import { cors } from "hono/cors";

import { PostgreSQLForkEngine } from "@flowdb/core";

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
  fork(sourceDatabaseUrl: string, branchName: string): Promise<string>;
  teardown(branchDatabaseUrl: string): Promise<void>;
  listBranches(hostUrl: string): Promise<string[]>;
  healthCheck(databaseUrl: string): Promise<boolean>;
};

type OrchestratorDependencies = {
  forkEngine: ForkEngine;
  branches: BranchStateRepository;
  vercel: VercelClient;
  githubComments: GithubCommentPublisher;
  migrationRunner: (projectRoot: string, branchDatabaseUrl: string) => Promise<MigrationRunReport>;
  webhookSecret: string;
  sourceDatabaseUrl: string;
  projectRoot: string;
  version: string;
  scheduleTask: (task: () => Promise<void>) => void;
};

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
  Variables: { githubId: string };
}> {
  const defaults = partialDeps ? undefined : createDefaultDependencies();
  const deps: OrchestratorDependencies = {
    ...(defaults ?? {
      forkEngine: partialDeps?.forkEngine as ForkEngine,
      branches: partialDeps?.branches as BranchStateRepository,
      vercel: partialDeps?.vercel as VercelClient,
      githubComments: partialDeps?.githubComments ?? new NoopGithubCommentPublisher(),
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

  const app = new Hono<{ Variables: { githubId: string } }>();

  app.use(
    "/*",
    cors({
      origin: ["http://localhost:4010", "http://localhost:3001"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.get("/health", (c) => {
    return c.json(
      {
        status: "ok",
        version: deps.version,
        timestamp: new Date().toISOString()
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
    const event = c.req.header("x-github-event");
    const signature = c.req.header("x-hub-signature-256");

    if (!event || !signature) {
      return c.json({ error: "Missing GitHub webhook headers." }, 400);
    }

    const rawBody = await c.req.text();
    if (!verifyGithubSignature(rawBody, signature, deps.webhookSecret)) {
      return c.json({ error: "Invalid signature." }, 401);
    }

    const json = parseJsonSafely<unknown>(rawBody);
    if (!json) {
      return c.json({ error: "Invalid JSON body." }, 400);
    }

    if (event === "pull_request") {
      const parsed = githubPullRequestSchema.safeParse(json);
      if (!parsed.success) {
        return c.json({ error: "Invalid pull_request payload." }, 400);
      }

      const payload = parsed.data;
      const githubId = c.get("githubId") as string;
      if (payload.action === "opened") {
        deps.scheduleTask(async () => {
          const branchDatabaseUrl = await deps.forkEngine.fork(
            deps.sourceDatabaseUrl,
            payload.pull_request.head.ref
          );
          await deps.branches.upsert(githubId, {
            prNumber: payload.pull_request.number,
            branchName: payload.pull_request.head.ref,
            branchDatabaseUrl,
            status: "active"
          });
        });
      }

      if (payload.action === "closed") {
        deps.scheduleTask(async () => {
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
        return c.json({ error: "Invalid push payload." }, 400);
      }

      deps.scheduleTask(async () => {
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
    const json = await c.req.json();
    const parsed = vercelWebhookSchema.safeParse(json);

    if (!parsed.success) {
      return c.json({ error: "Invalid Vercel payload." }, 400);
    }

    const payload = parsed.data;
    const deployment = payload.payload?.deployment;

    if (payload.type === "deployment.ready" && deployment?.target === "preview") {
      deps.scheduleTask(async () => {
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