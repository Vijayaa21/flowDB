import { Client } from "pg";

import { parseMigrations, reconcile } from "@flowdb/reconciler";

export type MigrationConflict = {
  table: string;
  column: string;
};

export type MigrationRunReport = {
  applied: string[];
  pending: string[];
  schemaDiffSummary: string;
  conflicts: MigrationConflict[];
};

export async function runPendingMigrations(
  projectRoot: string,
  branchDatabaseUrl: string
): Promise<MigrationRunReport> {
  const migrations = await parseMigrations(projectRoot);
  const reconciliation = reconcile(migrations, []);
  const ordered = reconciliation.order;

  const client = new Client({ connectionString: branchDatabaseUrl });
  await client.connect();

  try {
    await client.query(
      `
      CREATE TABLE IF NOT EXISTS flowdb_applied_migrations (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `
    );

    const existing = await client.query<{ id: string }>("SELECT id FROM flowdb_applied_migrations");
    const appliedIds = new Set(existing.rows.map((row) => row.id));

    const pending = ordered.filter((migration) => !appliedIds.has(migration.id));
    const pendingNames = pending.map((migration) => migration.filename);
    const applied: string[] = [];

    for (const migration of pending) {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO flowdb_applied_migrations (id, filename) VALUES ($1, $2)",
          [migration.id, migration.filename]
        );
        await client.query("COMMIT");
        applied.push(migration.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return {
      applied,
      pending: pendingNames,
      schemaDiffSummary: `Applied ${applied.length} of ${pendingNames.length} pending migration(s).`,
      conflicts: reconciliation.conflicts.map((conflict) => ({
        table: conflict.table,
        column: conflict.column
      }))
    };
  } finally {
    await client.end();
  }
}