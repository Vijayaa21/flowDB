import { readFile } from "node:fs/promises";
import path from "node:path";

import { SettingsForm } from "@/components/settings-form";

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
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure external integration credentials stored in .flowdb.config.json.
        </p>
      </section>

      <SettingsForm
        defaultValues={{
          orchestratorUrl: config.ORCHESTRATOR_URL ?? "http://localhost:3000",
          githubAppId: config.GITHUB_APP_ID ?? "",
          vercelToken: config.VERCEL_TOKEN ?? ""
        }}
      />
    </div>
  );
}
