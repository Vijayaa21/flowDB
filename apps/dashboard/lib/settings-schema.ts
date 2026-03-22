import { z } from "zod";

export const settingsFormSchema = z.object({
  orchestratorUrl: z.string().url("Enter a valid orchestrator URL"),
  githubAppId: z.coerce.number().int().positive("GitHub App ID must be a positive number"),
  githubWebhookSecret: z.string().min(1, "GitHub webhook secret is required"),
  vercelApiToken: z.string().min(1, "Vercel API token is required"),
  forkTimeoutMs: z.coerce.number().int().min(100, "Fork timeout must be at least 100 ms"),
  maxConcurrentBranches: z.coerce.number().int().min(1, "Must allow at least one branch"),
  autoTeardownDays: z.coerce.number().int().min(1, "Must be at least 1 day"),
  pgPoolSize: z.coerce.number().int().min(1, "Pool size must be at least 1")
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
