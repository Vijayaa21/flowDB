"use server";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ORCHESTRATOR_URL } from "@/lib/config";
import { settingsFormSchema } from "@/lib/settings-schema";

const configPath = path.join(process.cwd(), ".flowdb.config.json");

type DashboardConfig = {
  ORCHESTRATOR_URL?: string;
  GITHUB_APP_ID?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  VERCEL_API_TOKEN?: string;
  FORK_TIMEOUT_MS?: number;
  MAX_CONCURRENT_BRANCHES?: number;
  AUTO_TEARDOWN_DAYS?: number;
  PG_POOL_SIZE?: number;
};

async function readConfig(): Promise<DashboardConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as DashboardConfig;
  } catch {
    return {};
  }
}

async function writeConfig(nextConfig: DashboardConfig): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
}

export type SettingsActionState = {
  success: boolean;
  message: string;
};

export async function saveSettingsAction(formData: FormData): Promise<SettingsActionState> {
  const parsed = settingsFormSchema.safeParse({
    orchestratorUrl: formData.get("orchestratorUrl"),
    githubAppId: formData.get("githubAppId"),
    githubWebhookSecret: formData.get("githubWebhookSecret"),
    vercelApiToken: formData.get("vercelApiToken"),
    forkTimeoutMs: formData.get("forkTimeoutMs"),
    maxConcurrentBranches: formData.get("maxConcurrentBranches"),
    autoTeardownDays: formData.get("autoTeardownDays"),
    pgPoolSize: formData.get("pgPoolSize")
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid settings input. Please verify all fields."
    };
  }

  await writeConfig({
    ORCHESTRATOR_URL: parsed.data.orchestratorUrl,
    GITHUB_APP_ID: String(parsed.data.githubAppId),
    GITHUB_WEBHOOK_SECRET: parsed.data.githubWebhookSecret,
    VERCEL_API_TOKEN: parsed.data.vercelApiToken,
    FORK_TIMEOUT_MS: parsed.data.forkTimeoutMs,
    MAX_CONCURRENT_BRANCHES: parsed.data.maxConcurrentBranches,
    AUTO_TEARDOWN_DAYS: parsed.data.autoTeardownDays,
    PG_POOL_SIZE: parsed.data.pgPoolSize
  });

  return {
    success: true,
    message: "Saved to .flowdb.config.json"
  };
}

export async function teardownAllBranchesAction(confirmation: string): Promise<SettingsActionState> {
  if (confirmation.trim() !== "TEARDOWN ALL") {
    return {
      success: false,
      message: "Confirmation text must be TEARDOWN ALL"
    };
  }

  try {
    const config = await readConfig();
    const baseUrl = config.ORCHESTRATOR_URL ?? ORCHESTRATOR_URL;

    const listResponse = await fetch(`${baseUrl}/branches`, { cache: "no-store" });
    if (!listResponse.ok) {
      throw new Error(`Failed to list branches: ${listResponse.status}`);
    }

    const payload = (await listResponse.json()) as {
      branches?: Array<{ branchName: string }>;
    };
    const branches = payload.branches ?? [];

    for (const branch of branches) {
      const encoded = encodeURIComponent(branch.branchName);
      const deletion = await fetch(`${baseUrl}/branches/${encoded}`, {
        method: "DELETE"
      });

      if (!deletion.ok) {
        await fetch(`${baseUrl}/branches/${encoded}/teardown`, {
          method: "POST"
        });
      }
    }

    return {
      success: true,
      message: `Teardown requested for ${branches.length} branch(es).`
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to teardown all branches."
    };
  }
}

export async function resetFlowdbMetadataAction(confirmation: string): Promise<SettingsActionState> {
  if (confirmation.trim() !== "RESET") {
    return {
      success: false,
      message: "Confirmation text must be RESET"
    };
  }

  await writeConfig({});
  return {
    success: true,
    message: "FlowDB metadata has been reset."
  };
}
