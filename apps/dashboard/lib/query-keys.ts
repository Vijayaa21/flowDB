import type { DashboardConfig } from "./api";

export const queryKeys = {
  branches: (config: DashboardConfig) =>
    [
      "branches",
      config.orchestratorUrl,
      config.orgSlug,
      config.projectSlug,
      config.environment,
    ] as const,
  health: (config: DashboardConfig) =>
    [
      "health",
      config.orchestratorUrl,
      config.orgSlug,
      config.projectSlug,
      config.environment,
    ] as const,
};
