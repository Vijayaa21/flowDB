import { Hono } from "hono";
import { cors } from "hono/cors";

import { PostgreSQLForkEngine } from "@flowdb/core";

import {
  PostgresBranchStateRepository,
  type BranchStateRepository
} from "./branch-state-repository";
import { runPendingMigrations } from "./migration-runner";
import { githubPullRequestSchema, githubPushSchema, vercelWebhookSchema } from "./schemas";
import { verifyGithubSignature } from "./security";
import { VercelSdkClient, type VercelClient } from "./vercel-client";

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
  migrationRunner: (projectRoot: string, branchDatabaseUrl: string) => Promise<{ applied: string[] }>;
  webhookSecret: string;
  sourceDatabaseUrl: string;
  projectRoot: string;
  version: string;
  scheduleTask: (task: () => Promise<void>) => void;
};

function createDefaultDependencies(): OrchestratorDependencies {
  const sourceDatabaseUrl = process.env.DATABASE_URL;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const vercelApiToken = process.env.VERCEL_API_TOKEN;

  if (!sourceDatabaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!webhookSecret) {
    throw new Error("GITHUB_WEBHOOK_SECRET is required.");
  }
  if (!vercelApiToken) {
    throw new Error("VERCEL_API_TOKEN is required.");
  }

  return {
    forkEngine: new PostgreSQLForkEngine(),
    branches: new PostgresBranchStateRepository(sourceDatabaseUrl),
    vercel: new VercelSdkClient(vercelApiToken),
    migrationRunner: runPendingMigrations,
    webhookSecret,
    sourceDatabaseUrl,
    projectRoot: process.env.FLOWDB_PROJECT_ROOT ?? process.cwd(),
    version: process.env.FLOWDB_VERSION ?? "0.1.0",
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

export function createApp(partialDeps?: Partial<OrchestratorDependencies>): Hono {
  const defaults = partialDeps ? undefined : createDefaultDependencies();
  const deps: OrchestratorDependencies = {
    ...(defaults ?? {
      forkEngine: partialDeps?.forkEngine as ForkEngine,
      branches: partialDeps?.branches as BranchStateRepository,
      vercel: partialDeps?.vercel as VercelClient,
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

  const app = new Hono();

  app.use(
    cors({
      origin: ["http://localhost:3003", "http://localhost:4010"],
      credentials: true
    })
  );

  app.get("/health", (c) => {
    return c.json({ status: "ok", version: deps.version });
  });

  app.get("/branches", async (c) => {
    const branches = await deps.branches.listActive();
    return c.json(branches);
  });

  app.get("/branches/:name", async (c) => {
    const name = c.req.param("name");
    const branch = await deps.branches.getByBranchName(name);
    if (!branch) {
      return c.json({ error: `Branch "${name}" not found.` }, 404);
    }
    return c.json(branch);
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
      if (payload.action === "opened") {
        deps.scheduleTask(async () => {
          const branchDatabaseUrl = await deps.forkEngine.fork(
            deps.sourceDatabaseUrl,
            payload.pull_request.head.ref
          );
          await deps.branches.upsert({
            prNumber: payload.pull_request.number,
            branchName: payload.pull_request.head.ref,
            branchDatabaseUrl,
            status: "active"
          });
        });
      }

      if (payload.action === "closed") {
        deps.scheduleTask(async () => {
          const existing = await deps.branches.getByPrNumber(payload.pull_request.number);
          const target =
            existing ?? (await deps.branches.getByBranchName(payload.pull_request.head.ref));
          if (!target) {
            return;
          }
          await deps.forkEngine.teardown(target.branchDatabaseUrl);
          await deps.branches.setStatus(target.branchName, "closed");
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
        const branchName = toBranchName(parsed.data.ref);
        const branch = await deps.branches.getByBranchName(branchName);
        if (!branch) {
          return;
        }
        await deps.branches.setStatus(branchName, "migrating");
        try {
          await deps.migrationRunner(deps.projectRoot, branch.branchDatabaseUrl);
          await deps.branches.setStatus(branchName, "active");
        } catch {
          await deps.branches.setStatus(branchName, "error");
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
        const branchName = deployment.meta?.githubCommitRef ?? payload.payload?.git?.branch;
        const branch = branchName ? await deps.branches.getByBranchName(branchName) : null;
        const databaseUrl = branch?.branchDatabaseUrl ?? deps.sourceDatabaseUrl;
        await deps.vercel.injectDeploymentDatabaseUrl(deployment.id, databaseUrl);
      });
    }

    return c.json({ accepted: true }, 200);
  });

  return app;
}