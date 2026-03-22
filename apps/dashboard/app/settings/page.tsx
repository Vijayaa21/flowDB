import { readFile } from "node:fs/promises";
import path from "node:path";

import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/page-header";
import { ORCHESTRATOR_URL } from "@/lib/config";

type DashboardConfig = {
  ORCHESTRATOR_URL?: string;
  GITHUB_APP_ID?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  VERCEL_API_TOKEN?: string;
  VERCEL_TOKEN?: string;
  FORK_TIMEOUT_MS?: number;
  MAX_CONCURRENT_BRANCHES?: number;
  AUTO_TEARDOWN_DAYS?: number;
  PG_POOL_SIZE?: number;
};

async function loadConfig(): Promise<DashboardConfig> {
  const configPath = path.join(process.cwd(), ".flowdb.config.json");
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as DashboardConfig;
  } catch {
    return {};
  }
}

export default async function SettingsPage() {
  const config = await loadConfig();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Configure external integration credentials stored in .flowdb.config.json."
        breadcrumb={["Dashboard", "Settings"]}
      />

      <SettingsForm
        defaultValues={{
          orchestratorUrl: config.ORCHESTRATOR_URL ?? ORCHESTRATOR_URL,
          githubAppId: Number(config.GITHUB_APP_ID ?? 0),
          githubWebhookSecret: config.GITHUB_WEBHOOK_SECRET ?? "",
          vercelApiToken: config.VERCEL_API_TOKEN ?? config.VERCEL_TOKEN ?? "",
          forkTimeoutMs: config.FORK_TIMEOUT_MS ?? 500,
          maxConcurrentBranches: config.MAX_CONCURRENT_BRANCHES ?? 10,
          autoTeardownDays: config.AUTO_TEARDOWN_DAYS ?? 7,
          pgPoolSize: config.PG_POOL_SIZE ?? 5
        }}
      />
    </div>
  );
}
