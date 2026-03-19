import { describe, expect, test } from "vitest";

import { reconcile } from "../src";
import type { Migration } from "../src";

function migration(id: string, sql: string): Migration {
  return {
    id,
    filename: `${id}.sql`,
    orm: "raw",
    sql
  };
}

describe("reconcile", () => {
  test("returns safe migrations, detected conflicts, and topological order", () => {
    const mainMigrations: Migration[] = [
      migration(
        "main_create_users",
        "CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL, full_name TEXT);"
      ),
      migration("main_alter_users_email", "ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(320);")
    ];

    const branchMigrations: Migration[] = [
      migration("branch_alter_users_email", "ALTER TABLE users ADD COLUMN email TEXT;"),
      migration("branch_alter_users_full_name", "ALTER TABLE users ALTER COLUMN full_name TYPE VARCHAR(255);")
    ];

    const result = reconcile(branchMigrations, mainMigrations);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.branchMigration.id).toBe("branch_alter_users_email");
    expect(result.safe.map((migration) => migration.id)).toEqual(["branch_alter_users_full_name"]);

    const orderIds = result.order.map((migration) => migration.id);
    expect(orderIds.indexOf("main_create_users")).toBeLessThan(
      orderIds.indexOf("main_alter_users_email")
    );
    expect(orderIds.indexOf("main_create_users")).toBeLessThan(
      orderIds.indexOf("branch_alter_users_full_name")
    );
  });
});