import { readFile } from "node:fs/promises";
import path from "node:path";

import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/page-header";
import { ORCHESTRATOR_URL } from "@/lib/config";

type DashboardConfig = {
  ORCHESTRATOR_URL?: string;
  GITHUB_APP_ID?: string;
  VERCEL_TOKEN?: string;
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
          githubAppId: config.GITHUB_APP_ID ?? "",
          vercelToken: config.VERCEL_TOKEN ?? ""
        }}
      />
    </div>
  );
}
