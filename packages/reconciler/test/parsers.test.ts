import path from "node:path";

import { describe, expect, test } from "vitest";

import { parseMigrations } from "../src";

describe("parseMigrations", () => {
  test("auto-detects Prisma, Drizzle, and raw SQL migrations", async () => {
    const projectRoot = path.join(import.meta.dirname, "fixtures", "project");
    const migrations = await parseMigrations(projectRoot);

    expect(migrations.length).toBe(3);
    expect(migrations.map((migration) => migration.orm).sort()).toEqual([
      "drizzle",
      "prisma",
      "raw",
    ]);
    expect(migrations.every((migration) => migration.sql.trim().length > 0)).toBe(true);
    expect(migrations.every((migration) => migration.appliedAt instanceof Date)).toBe(true);
    expect(migrations.map((migration) => migration.filename)).toEqual([
      "drizzle/0001_add_orders.sql",
      "migrations/001_add_index.sql",
      "prisma/migrations/202601010001_init/migration.sql",
    ]);
  });
});
