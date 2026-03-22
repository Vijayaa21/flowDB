import type { BranchApiResponse, BranchDetailApiResponse } from "./types";
import { ORCHESTRATOR_URL } from "./config";

async function fetchJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ORCHESTRATOR_URL}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as { error?: string };
      details = payload.error ? `: ${payload.error}` : "";
    } catch {
      details = "";
    }
    throw new Error(`Request failed with ${response.status}${details}`);
  }

  return (await response.json()) as T;
}

export async function fetchBranches(): Promise<BranchApiResponse> {
  return fetchJson<BranchApiResponse>("/branches");
}

export async function fetchBranchDetail(name: string): Promise<BranchDetailApiResponse> {
  const fallback: BranchDetailApiResponse = {
    branch: {
      branchName: name,
      status: "conflict",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      forkOf: "main"
    },
    migrationTimeline: [
      {
        id: `${name}-001`,
        filename: "001_create_orders.sql",
        status: "applied",
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        sql: "CREATE TABLE orders (id UUID PRIMARY KEY, total_cents INTEGER NOT NULL);"
      },
      {
        id: `${name}-002`,
        filename: "002_add_orders_index.sql",
        status: "pending",
        timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        sql: "CREATE INDEX idx_orders_total_cents ON orders(total_cents);"
      },
      {
        id: `${name}-003`,
        filename: "003_rename_orders_total.sql",
        status: "failed",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        sql: "ALTER TABLE orders RENAME COLUMN total_cents TO amount_cents;"
      }
    ],
    conflicts: [
      {
        id: `${name}-conflict-1`,
        tableName: "orders",
        columnName: "total_cents",
        conflictType: "Both branches renamed this column",
        resolutionSql:
          "ALTER TABLE orders RENAME COLUMN total_cents TO amount_cents;\nALTER TABLE orders RENAME COLUMN amount TO amount_cents;",
        target: "orders.total_cents",
        hint: "Resolve by choosing one canonical column name."
      }
    ],
    schemaDiff: {
      mainSql: "CREATE TABLE orders (id UUID PRIMARY KEY, amount INTEGER NOT NULL);",
      branchSql: "CREATE TABLE orders (id UUID PRIMARY KEY, amount_cents INTEGER NOT NULL);"
    }
  };

  const normalize = (raw: BranchDetailApiResponse): BranchDetailApiResponse => {
    const hasTimeline = Array.isArray(raw.migrationTimeline) && raw.migrationTimeline.length > 0;
    const hasSchema = Boolean(raw.schemaDiff?.mainSql) && Boolean(raw.schemaDiff?.branchSql);
    const normalizedStatus = raw.branch?.status ?? "conflict";
    const hasConflicts = Array.isArray(raw.conflicts) && raw.conflicts.length > 0;

    return {
      branch: {
        branchName: raw.branch?.branchName ?? name,
        status: normalizedStatus,
        createdAt: raw.branch?.createdAt ?? fallback.branch?.createdAt,
        forkOf: raw.branch?.forkOf ?? "main"
      },
      migrationTimeline: hasTimeline
        ? raw.migrationTimeline.map((item) => ({
            ...item,
            status: item.status ?? "pending",
            sql: item.sql ?? `-- SQL unavailable for ${item.filename}`
          }))
        : fallback.migrationTimeline,
      conflicts: normalizedStatus === "conflict" ? (hasConflicts ? raw.conflicts : fallback.conflicts) : [],
      schemaDiff: hasSchema ? raw.schemaDiff : fallback.schemaDiff
    };
  };

  try {
    const raw = await fetchJson<BranchDetailApiResponse>(`/branches/${encodeURIComponent(name)}`);
    return normalize(raw);
  } catch {
    return fallback;
  }
}

export async function teardownBranch(name: string): Promise<void> {
  try {
    await fetchJson(`/branches/${encodeURIComponent(name)}`, {
      method: "DELETE"
    });
  } catch {
    await fetchJson(`/branches/${encodeURIComponent(name)}/teardown`, {
      method: "POST"
    });
  }
}

export async function fetchOrchestratorHealth(): Promise<{ status: string; version?: string }> {
  return fetchJson<{ status: string; version?: string }>("/health");
}

export async function seedBranch(name: string, sql: string): Promise<void> {
  await fetchJson(`/branches/${encodeURIComponent(name)}/seed`, {
    method: "POST",
    body: JSON.stringify({ sql })
  });
}

export async function reseedDemoBranches(): Promise<{ accepted: boolean; count: number }> {
  return fetchJson<{ accepted: boolean; count: number }>("/dev/reseed", {
    method: "POST"
  });
}
