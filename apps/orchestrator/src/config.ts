import path from "node:path";

export type OrchestratorConfig = {
  port: number;
  databaseUrl: string;
  migrationsDir: string;
};

function parsePort(value: string | undefined): number {
  const raw = value?.trim() || "3000";
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }

  return parsed;
}

export function getConfig(): OrchestratorConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL for orchestrator startup.");
  }

  return {
    port: parsePort(process.env.PORT),
    databaseUrl,
    migrationsDir: path.resolve(process.cwd(), "apps", "orchestrator", "migrations")
  };
}
