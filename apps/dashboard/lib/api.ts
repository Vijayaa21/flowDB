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

export async function fetchOrchestratorHealth(): Promise<{ status: string; version?: string }> {
  return fetchJson<{ status: string; version?: string }>("/health");
}
