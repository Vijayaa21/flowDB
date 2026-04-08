import { Client } from "pg";

import { assertProductionConfig, getConfig, getMissingEnvMessages, isProductionRuntime } from "./config";
import { createApp } from "./server";

async function canConnectToDatabase(databaseUrl: string | null): Promise<boolean> {
  if (!databaseUrl) {
    return false;
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function start(): Promise<void> {
  const config = getConfig();
  if (isProductionRuntime()) {
    assertProductionConfig(config);
  }

  const app = createApp();
  const missingEnv = getMissingEnvMessages();

  for (const message of missingEnv) {
    console.warn(`[config] ${message}`);
  }

  const databaseConnected = await canConnectToDatabase(config.databaseUrl);

  const bunRuntime = globalThis as typeof globalThis & {
    Bun?: {
      serve: (options: { port: number; fetch: typeof app.fetch }) => unknown;
    };
  };

  if (!bunRuntime.Bun) {
    throw new Error("Bun runtime is required to start the orchestrator server.");
  }

  bunRuntime.Bun.serve({
    port: config.port,
    fetch: app.fetch
  });

  console.log(`FlowDB Orchestrator running on http://localhost:${config.port}`);
  console.log(
    databaseConnected ? "Database: connected" : "Database: not connected (branches will return empty)"
  );
}

void start();
