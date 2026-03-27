import path from "node:path";

type Config = {
  port: number;
  databaseUrl: string | null;
  sourceDatabaseUrl: string;
  githubWebhookSecret: string | null;
  vercelApiToken: string | null;
  projectRoot: string;
  version: string;
  migrationsDir: string;
};

function readOptional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function parsePort(value: string | null): number {
  const portValue = value ?? "3000";
  const parsed = Number(portValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: \"${portValue}\". PORT must be an integer between 1 and 65535.`);
  }
  return parsed;
}

export function getConfig(): Config {
  const databaseUrl = readOptional("DATABASE_URL");
  const sourceDatabaseUrl = readOptional("SOURCE_DATABASE_URL") ?? databaseUrl ?? "";

  return {
    port: parsePort(readOptional("PORT")),
    databaseUrl,
    sourceDatabaseUrl,
    githubWebhookSecret: readOptional("GITHUB_WEBHOOK_SECRET"),
    vercelApiToken: readOptional("VERCEL_API_TOKEN"),
    projectRoot: readOptional("FLOWDB_PROJECT_ROOT") ?? process.cwd(),
    version: readOptional("FLOWDB_VERSION") ?? "0.1.0",
    migrationsDir: path.resolve(process.cwd(), "apps", "orchestrator", "migrations")
  };
}

export function getMissingEnvMessages(): string[] {
  const missing: string[] = [];

  if (!readOptional("DATABASE_URL")) {
    missing.push("DATABASE_URL is missing. Branch endpoints will return an empty array until it is set.");
  }
  if (!readOptional("GITHUB_WEBHOOK_SECRET")) {
    missing.push("GITHUB_WEBHOOK_SECRET is missing. GitHub webhook signature verification will fail.");
  }
  if (!readOptional("VERCEL_API_TOKEN")) {
    missing.push("VERCEL_API_TOKEN is missing. Vercel deployment variable injection is disabled.");
  }

  return missing;
}
