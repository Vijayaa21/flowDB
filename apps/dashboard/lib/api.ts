import type { BranchApiResponse, BranchDetailApiResponse } from "./types";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ??
  process.env.ORCHESTRATOR_URL ??
  "http://localhost:3000";

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
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchBranches(): Promise<BranchApiResponse> {
  return fetchJson<BranchApiResponse>("/branches");
}

export async function fetchBranchDetail(name: string): Promise<BranchDetailApiResponse> {
  try {
    return await fetchJson<BranchDetailApiResponse>(`/branches/${encodeURIComponent(name)}`);
  } catch {
    return {
      migrationTimeline: [],
      conflicts: [],
      schemaDiff: {
        mainSql: "-- main schema unavailable from orchestrator route",
        branchSql: "-- branch schema unavailable from orchestrator route"
      }
    };
  }
}

export async function teardownBranch(name: string): Promise<void> {
  try {
    await fetchJson(`/branches/${encodeURIComponent(name)}/teardown`, {
      method: "POST"
    });
  } catch {
    return;
  }
}
