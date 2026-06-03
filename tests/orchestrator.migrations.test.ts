import { beforeEach, describe, expect, test, vi } from "vitest";

const appliedNames: string[] = [];
const queries: string[] = [];

const mockClient = {
  connect: vi.fn(async () => undefined),
  end: vi.fn(async () => undefined),
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    queries.push(sql);

    if (sql.includes("SELECT name FROM schema_migrations")) {
      return {
        rows: appliedNames.map((name) => ({ name })),
      };
    }

    if (sql.includes("INSERT INTO schema_migrations")) {
      const migrationName = String(params?.[0] ?? "");
      if (migrationName) {
        appliedNames.push(migrationName);
      }
      return { rows: [] };
    }

    return { rows: [] };
  }),
};

const clientCtor = vi.fn(() => mockClient);

vi.mock("pg", () => {
  return {
    Client: clientCtor,
  };
});

vi.mock("node:fs/promises", () => {
  return {
    readdir: vi.fn(async () => [
      {
        name: "001_init.sql",
        isFile: () => true,
      },
      {
        name: "README.md",
        isFile: () => true,
      },
    ]),
    readFile: vi.fn(async () => "CREATE TABLE IF NOT EXISTS test_table(id INTEGER);"),
  };
});

describe("runPendingMigrations", () => {
  beforeEach(() => {
    appliedNames.length = 0;
    queries.length = 0;
    clientCtor.mockClear();
    mockClient.connect.mockClear();
    mockClient.end.mockClear();
    mockClient.query.mockClear();
  });

  test("applies migration on first run and skips on repeat run", async () => {
    const { runPendingMigrations } = await import("../apps/orchestrator/src/migrations");

    const first = await runPendingMigrations({
      databaseUrl: "postgres://postgres:postgres@localhost:5432/postgres",
      migrationsDir: "apps/orchestrator/migrations",
    });

    expect(first).toEqual(["001_init.sql"]);
    expect(appliedNames).toEqual(["001_init.sql"]);
    expect(queries.some((q) => q.includes("BEGIN"))).toBe(true);

    queries.length = 0;

    const second = await runPendingMigrations({
      databaseUrl: "postgres://postgres:postgres@localhost:5432/postgres",
      migrationsDir: "apps/orchestrator/migrations",
    });

    expect(second).toEqual([]);
    expect(queries.some((q) => q.includes("BEGIN"))).toBe(false);
  });
});
