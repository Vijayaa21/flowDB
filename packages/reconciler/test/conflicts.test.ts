import { describe, expect, test } from "vitest";

import { detectConflicts, getAlteredColumns } from "../src";
import type { Migration } from "../src";

function migration(id: string, sql: string): Migration {
  return {
    id,
    filename: `${id}.sql`,
    orm: "raw",
    sql
  };
}

describe("conflict detector", () => {
  test("extracts altered table columns from SQL AST", () => {
    const refs = getAlteredColumns(`
      ALTER TABLE users ADD COLUMN email TEXT;
      ALTER TABLE users ALTER COLUMN full_name TYPE VARCHAR(255);
    `);

    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "users", column: "email" }),
        expect.objectContaining({ table: "users", column: "full_name" })
      ])
    );
  });

  test("detects conflicts when branch and main alter same table column", () => {
    const branch = [migration("branch_1", "ALTER TABLE users ADD COLUMN email TEXT;")];
    const main = [migration("main_1", "ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);")];

    const conflicts = detectConflicts(branch, main);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.table).toBe("users");
    expect(conflicts[0]?.column).toBe("email");
    expect(conflicts[0]?.branchMigration.id).toBe("branch_1");
    expect(conflicts[0]?.mainMigration.id).toBe("main_1");
  });

  test("does not flag different columns as conflict", () => {
    const branch = [migration("branch_1", "ALTER TABLE users ADD COLUMN email TEXT;")];
    const main = [migration("main_1", "ALTER TABLE users ADD COLUMN full_name TEXT;")];

    const conflicts = detectConflicts(branch, main);

    expect(conflicts).toHaveLength(0);
  });
});