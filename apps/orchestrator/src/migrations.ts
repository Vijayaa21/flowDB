import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

type AppliedMigrationRow = {
  name: string;
};

type RunPendingMigrationsInput = {
  databaseUrl: string;
  migrationsDir: string;
};

export async function runPendingMigrations(input: RunPendingMigrationsInput): Promise<string[]> {
  const migrationFiles = await listMigrationFiles(input.migrationsDir);
  const client = new Client({ connectionString: input.databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<AppliedMigrationRow>(
      "SELECT name FROM schema_migrations ORDER BY name ASC"
    );
    const appliedSet = new Set(appliedResult.rows.map((row) => row.name));
    const newlyApplied: string[] = [];

    for (const filePath of migrationFiles) {
      const migrationName = path.basename(filePath);
      if (appliedSet.has(migrationName)) {
        continue;
      }

      const sql = await readFile(filePath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [migrationName, checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      newlyApplied.push(migrationName);
      appliedSet.add(migrationName);
    }

    return newlyApplied;
  } finally {
    await client.end();
  }
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(migrationsDir, name));
}
