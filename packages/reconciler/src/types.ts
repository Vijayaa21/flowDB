export type MigrationOrm = "prisma" | "drizzle" | "raw";

export type Migration = {
  id: string;
  filename: string;
  appliedAt?: Date;
  sql: string;
  orm: MigrationOrm;
};

export type Conflict = {
  table: string;
  column: string;
  branchMigration: Migration;
  mainMigration: Migration;
};

export type ReconcileResult = {
  safe: Migration[];
  conflicts: Conflict[];
  order: Migration[];
};
