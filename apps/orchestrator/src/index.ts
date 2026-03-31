export * from "./contracts";
export * from "./config";
export * from "./migrations";

import { pathToFileURL } from "node:url";
import { handle } from "hono/vercel";

import { createApp } from "./server";
import { getConfig } from "./config";
import { runPendingMigrations } from "./migrations";

const app = createApp();

export { app };
export default handle(app);

export async function startOrchestrator(): Promise<void> {
	const config = getConfig();
	const migrationDatabaseUrl = config.databaseUrl ?? config.sourceDatabaseUrl;
	if (!migrationDatabaseUrl) {
		throw new Error("DATABASE_URL or SOURCE_DATABASE_URL is required to run migrations.");
	}
	const appliedMigrations = await runPendingMigrations({
		databaseUrl: migrationDatabaseUrl,
		migrationsDir: config.migrationsDir
	});

	if (appliedMigrations.length > 0) {
		console.info(`[orchestrator] applied migrations: ${appliedMigrations.join(", ")}`);
	} else {
		console.info("[orchestrator] no pending migrations");
	}

	const app = createApp();

	const runtime = globalThis as typeof globalThis & {
		Bun?: {
			serve: (options: { port: number; fetch: typeof app.fetch }) => unknown;
		};
	};

	if (!runtime.Bun) {
		console.info("[orchestrator] Bun runtime not detected; migration bootstrap completed.");
		return;
	}

	runtime.Bun.serve({
		port: config.port,
		fetch: app.fetch
	});

	console.info(`[orchestrator] listening on http://localhost:${config.port}`);
}

function isDirectExecution(): boolean {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}

	const entryUrl = pathToFileURL(entry).href;
	return entryUrl === import.meta.url;
}

if (isDirectExecution()) {
	void startOrchestrator().catch((error: unknown) => {
		const message = error instanceof Error ? error.stack ?? error.message : String(error);
		console.error(`[orchestrator] startup failed: ${message}`);
		process.exitCode = 1;
	});
}
