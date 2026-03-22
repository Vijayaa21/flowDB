import { createApp } from "./server.js";
import type { BranchStateRepository } from "./branch-state-repository";
import type { MigrationRunReport } from "./migration-runner";
import type { BranchRecord, BranchStatus } from "./types";

function createSeedRecord(
  prNumber: number,
  branchName: string,
  status: BranchStatus,
  ageMinutes: number
): BranchRecord {
  const createdAt = new Date(Date.now() - ageMinutes * 60_000);
  return {
    prNumber,
    branchName,
    branchDatabaseUrl: `postgres://local/${branchName}`,
    status,
    createdAt,
    updatedAt: createdAt
  };
}

function createInitialRecords(): BranchRecord[] {
  return [
    createSeedRecord(101, "feature/auth-overhaul", "active", 15),
    createSeedRecord(102, "feature/payment-retry", "migrating", 95),
    createSeedRecord(103, "fix/reporting-timezone", "error", 240)
  ];
}

function createInMemoryBranchesRepository(): {
  repository: BranchStateRepository;
  reseed: () => number;
} {
  const records = new Map<string, BranchRecord>();

  const reseed = (): number => {
    records.clear();
    for (const record of createInitialRecords()) {
      records.set(record.branchName, record);
    }
    return records.size;
  };

  reseed();

  return {
    repository: {
    async upsert(record) {
      const now = new Date();
      const existing = records.get(record.branchName);
      records.set(record.branchName, {
        prNumber: record.prNumber,
        branchName: record.branchName,
        branchDatabaseUrl: record.branchDatabaseUrl,
        status: record.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    },
    async getByBranchName(branchName) {
      return records.get(branchName) ?? null;
    },
    async getByPrNumber(prNumber) {
      for (const record of records.values()) {
        if (record.prNumber === prNumber) {
          return record;
        }
      }
      return null;
    },
    async setStatus(branchName, status) {
      const existing = records.get(branchName);
      if (!existing) {
        return;
      }
      records.set(branchName, {
        ...existing,
        status,
        updatedAt: new Date()
      });
    },
    async listActive() {
      return [...records.values()]
        .filter((record) => record.status !== "closed")
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    },
    reseed
  };
}

const inMemoryStore = createInMemoryBranchesRepository();

const app = createApp({
  forkEngine: {
    async fork(_sourceDatabaseUrl: string, branchName: string): Promise<string> {
      return `postgres://local/${branchName}`;
    },
    async teardown(_branchDatabaseUrl: string): Promise<void> {
      return;
    },
    async listBranches(): Promise<string[]> {
      return [];
    },
    async healthCheck(): Promise<boolean> {
      return true;
    }
  },
  branches: inMemoryStore.repository,
  vercel: {
    async injectDeploymentDatabaseUrl(): Promise<void> {
      return;
    }
  },
  githubComments: {
    async upsertReconcileComment(): Promise<void> {
      return;
    }
  },
  migrationRunner: async (): Promise<MigrationRunReport> => ({
    applied: [],
    pending: [],
    schemaDiffSummary: "No migrations were applied.",
    conflicts: []
  }),
  webhookSecret: "dev-webhook-secret",
  sourceDatabaseUrl: "postgres://local/main",
  projectRoot: process.cwd(),
  version: "0.1.0-dev",
  scheduleTask: (task) => {
    setTimeout(() => {
      void task();
    }, 0);
  }
});

app.post("/dev/reseed", (c) => {
  const count = inMemoryStore.reseed();
  return c.json({ accepted: true, count }, 200);
});

const bunRuntime = (globalThis as unknown as { Bun?: { serve: (input: { port: number; fetch: typeof app.fetch }) => unknown } }).Bun;

if (!bunRuntime) {
  throw new Error("This dev server requires Bun runtime.");
}

const port = Number(process.env.PORT ?? 3000);

bunRuntime.serve({
  port,
  fetch: app.fetch
});

console.log(`FlowDB orchestrator dev server running on http://localhost:${port}`);
