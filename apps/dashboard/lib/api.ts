"use client";

import { getSession } from "next-auth/react";

const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3000";

export type Branch = {
  branchName: string;
  status: string;
  prNumber?: number;
  updatedAt?: string;
  createdAt?: string;
};

export type HealthStatus = {
  status: string;
  version?: string;
  timestamp?: string;
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${orchestratorUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export const api = {
  branches: {
    list: () => apiFetch<Branch[]>("/branches"),
    teardown: (name: string) =>
      apiFetch(`/branches/${encodeURIComponent(name)}`, { method: "DELETE" })
  },
  health: {
    check: () => apiFetch<HealthStatus>("/health")
  }
};
