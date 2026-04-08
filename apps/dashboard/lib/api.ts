"use client";

import { getSession } from "next-auth/react";

const DEFAULT_ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3000";
const DEFAULT_ORG_SLUG = process.env.NEXT_PUBLIC_FLOWDB_ORG_SLUG ?? "";
const DEFAULT_PROJECT_SLUG = process.env.NEXT_PUBLIC_FLOWDB_PROJECT_SLUG ?? "";
const DEFAULT_ENVIRONMENT = process.env.NEXT_PUBLIC_FLOWDB_ENVIRONMENT ?? "local";

const CONFIG_KEYS = {
  orchestratorUrl: "flowdb.orchestratorUrl",
  orgSlug: "flowdb.orgSlug",
  projectSlug: "flowdb.projectSlug",
  environment: "flowdb.environment"
} as const;

export type DashboardConfig = {
  orchestratorUrl: string;
  orgSlug: string;
  projectSlug: string;
  environment: string;
};

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

type BranchListResponse =
  | Branch[]
  | {
      items?: Branch[];
    };

function buildRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function readDashboardConfig(): DashboardConfig {
  if (typeof window === "undefined") {
    return {
      orchestratorUrl: DEFAULT_ORCHESTRATOR_URL,
      orgSlug: DEFAULT_ORG_SLUG,
      projectSlug: DEFAULT_PROJECT_SLUG,
      environment: DEFAULT_ENVIRONMENT
    };
  }

  return {
    orchestratorUrl: normalizeUrl(
      window.localStorage.getItem(CONFIG_KEYS.orchestratorUrl) ?? DEFAULT_ORCHESTRATOR_URL
    ),
    orgSlug: (window.localStorage.getItem(CONFIG_KEYS.orgSlug) ?? DEFAULT_ORG_SLUG).trim(),
    projectSlug: (window.localStorage.getItem(CONFIG_KEYS.projectSlug) ?? DEFAULT_PROJECT_SLUG).trim(),
    environment: (window.localStorage.getItem(CONFIG_KEYS.environment) ?? DEFAULT_ENVIRONMENT).trim()
  };
}

export function saveDashboardConfig(config: DashboardConfig): DashboardConfig {
  const normalized: DashboardConfig = {
    orchestratorUrl: normalizeUrl(config.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL),
    orgSlug: config.orgSlug.trim(),
    projectSlug: config.projectSlug.trim(),
    environment: config.environment.trim() || DEFAULT_ENVIRONMENT
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONFIG_KEYS.orchestratorUrl, normalized.orchestratorUrl);
    window.localStorage.setItem(CONFIG_KEYS.orgSlug, normalized.orgSlug);
    window.localStorage.setItem(CONFIG_KEYS.projectSlug, normalized.projectSlug);
    window.localStorage.setItem(CONFIG_KEYS.environment, normalized.environment);
  }

  return normalized;
}

async function apiFetch<T>(path: string, config: DashboardConfig, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  const headers = new Headers(init.headers);
  headers.set("x-request-id", buildRequestId());
  headers.set("accept", "application/json");

  if (config.orgSlug) {
    headers.set("x-org-slug", config.orgSlug);
  }
  if (config.projectSlug) {
    headers.set("x-project-slug", config.projectSlug);
  }
  if (config.environment) {
    headers.set("x-flowdb-environment", config.environment);
  }

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${config.orchestratorUrl}${path}`, {
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
    list: async (config: DashboardConfig) => {
      const response = await apiFetch<BranchListResponse>("/branches", config);
      if (Array.isArray(response)) {
        return response;
      }
      return response.items ?? [];
    },
    teardown: (name: string, config: DashboardConfig) =>
      apiFetch(`/branches/${encodeURIComponent(name)}`, config, { method: "DELETE" })
  },
  health: {
    check: (config: DashboardConfig) => apiFetch<HealthStatus>("/health", config)
  }
};
