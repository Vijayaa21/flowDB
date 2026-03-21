"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const settingsSchema = z.object({
  orchestratorUrl: z.string().url(),
  githubAppId: z.string().min(1),
  vercelToken: z.string().min(1)
});

export type SettingsActionState = {
  success: boolean;
  message: string;
};

export async function saveSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    orchestratorUrl: formData.get("orchestratorUrl"),
    githubAppId: formData.get("githubAppId"),
    vercelToken: formData.get("vercelToken")
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid settings input. Please verify all fields."
    };
  }

  const configPath = path.join(process.cwd(), ".flowdb.config.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ORCHESTRATOR_URL: parsed.data.orchestratorUrl,
        GITHUB_APP_ID: parsed.data.githubAppId,
        VERCEL_TOKEN: parsed.data.vercelToken
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    success: true,
    message: "Saved to .flowdb.config.json"
  };
}
