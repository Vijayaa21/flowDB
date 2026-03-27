import { execSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import chalk from "chalk";
import { Command } from "commander";
import ora, { type Ora } from "ora";
import { Client } from "pg";

import { PostgreSQLForkEngine as ForkEngine } from "@flowdb/core";

type Migration = {
  id: string;
  filename: string;
  appliedAt?: Date;
  sql: string;
  orm: "prisma" | "drizzle" | "raw";
};

async function loadReconciler() {
  return import("@flowdb/reconciler");
}

type OrmType = "prisma" | "drizzle" | "raw" | "unknown";

type FlowdbConfig = {
  orm: OrmType;
  sourceDatabaseUrl: string;
};

type Ui = {
  log: (message: string) => void;
  error: (message: string) => void;
  spinner: (text: string) => Ora;
};

type CliDeps = {
  cwd: () => string;
  env: NodeJS.ProcessEnv;
  ui: Ui;
  exit: (code: number) => void;
  forkEngine: ForkEngine;
};

const CONFIG_FILE = ".flowdb.config.json";

function defaultDeps(): CliDeps {
  return {
    cwd: () => process.cwd(),
    env: process.env,
    ui: {
      log: console.log,
      error: console.error,
      spinner: (text) => ora(text)
    },
    exit: (code) => {
      process.exitCode = code;
    },
    forkEngine: new ForkEngine()
  };
}

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "").trim();
  if (!name) {
    throw new Error("DATABASE_URL must contain a database name.");
  }
  return name;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function sanitizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function inferBranchRefFromDbName(sourceDatabaseUrl: string, branchDbName: string): string {
  const sourceDb = sanitizeName(getDatabaseName(sourceDatabaseUrl));
  const prefix = `flowdb_branch_${sourceDb}_`;

  if (!branchDbName.startsWith(prefix)) {
    return branchDbName;
  }

  const withoutPrefix = branchDbName.slice(prefix.length);
  const withoutSuffix = withoutPrefix.replace(/_[a-z0-9]+$/, "");
  return withoutSuffix || branchDbName;
}

function parseBranchCreatedAtMs(branchDbName: string): number | null {
  const suffix = branchDbName.split("_").at(-1);
  if (!suffix) {
    return null;
  }
  const parsed = Number.parseInt(suffix, 36);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formatAge(branchDbName: string): string {
  const createdAt = parseBranchCreatedAtMs(branchDbName);
  if (!createdAt) {
    return "unknown";
  }
  const ageMs = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) {
    return "<1m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => (row[idx] ?? "").length))
  );
  const renderRow = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i], " ")).join("  ");
  return [renderRow(headers), renderRow(widths.map((w) => "-".repeat(w))), ...rows.map(renderRow)].join(
    "\n"
  );
}

async function detectOrm(projectRoot: string): Promise<OrmType> {
  const { parseMigrations } = await loadReconciler();
  const migrations = await parseMigrations(projectRoot);
  if (migrations.length === 0) {
    return "unknown";
  }
  const score = new Map<OrmType, number>([
    ["prisma", 0],
    ["drizzle", 0],
    ["raw", 0],
    ["unknown", 0]
  ]);
  for (const migration of migrations) {
    score.set(migration.orm, (score.get(migration.orm) ?? 0) + 1);
  }
  const ordered = [...score.entries()].sort((a, b) => b[1] - a[1]);
  return ordered[0]?.[0] ?? "unknown";
}

async function readConfig(projectRoot: string, env: NodeJS.ProcessEnv): Promise<FlowdbConfig> {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as FlowdbConfig;
    if (!parsed.sourceDatabaseUrl) {
      throw new Error("sourceDatabaseUrl missing");
    }
    return parsed;
  } catch {
    if (!env.DATABASE_URL) {
      throw new Error(
        "FlowDB config missing. Run `flowdb init` first or set DATABASE_URL in your environment."
      );
    }
    return {
      orm: "unknown",
      sourceDatabaseUrl: env.DATABASE_URL
    };
  }
}

async function writeEnvLocal(projectRoot: string, databaseUrl: string): Promise<void> {
  const envPath = path.join(projectRoot, ".env.local");
  let existing = "";
  try {
    existing = await readFile(envPath, "utf8");
  } catch {
    existing = "";
  }

  const lines = existing
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith("DATABASE_URL="));
  lines.push(`DATABASE_URL=${databaseUrl}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
}

async function resolveBranchDbName(
  engine: ForkEngine,
  hostUrl: string,
  inputName: string
): Promise<string> {
  const branches = await engine.listBranches(hostUrl);
  if (branches.includes(inputName)) {
    return inputName;
  }

  const sanitizedInput = inputName.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const fuzzy = branches.find((name) => name.includes(`_${sanitizedInput}_`));
  if (fuzzy) {
    return fuzzy;
  }

  throw new Error(`Branch database '${inputName}' not found.`);
}

async function queryAppliedMigrationIds(databaseUrl: string): Promise<Set<string>> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM flowdb_applied_migrations ORDER BY applied_at ASC"
    );
    return new Set(result.rows.map((row) => row.id));
  } catch {
    return new Set<string>();
  } finally {
    await client.end();
  }
}

function currentGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return "unknown";
  }
}

async function commandWrapper(ui: Ui, action: () => Promise<void>, exit: (code: number) => void) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    ui.error(chalk.red(`Error: ${message}`));
    exit(1);
  }
}

export function createProgram(inputDeps?: Partial<CliDeps>): Command {
  const deps = { ...defaultDeps(), ...inputDeps };

  const program = new Command();
  program
    .name("flowdb")
    .description("FlowDB CLI")
    .showHelpAfterError();

  program.command("init").description("Detect ORM and initialize FlowDB config").action(async () => {
    await commandWrapper(
      deps.ui,
      async () => {
        const cwd = deps.cwd();
        const databaseUrl = deps.env.DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("DATABASE_URL is required to initialize FlowDB.");
        }

        const spinner = deps.ui.spinner("Detecting ORM and writing FlowDB config...").start();
        const orm = await detectOrm(cwd);
        const config: FlowdbConfig = {
          orm,
          sourceDatabaseUrl: databaseUrl
        };

        await writeFile(path.join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, "utf8");
        await writeEnvLocal(cwd, databaseUrl);
        spinner.succeed("FlowDB initialized.");
        deps.ui.log(chalk.green(`Detected ORM: ${orm}`));
      },
      deps.exit
    );
  });

  const branch = program.command("branch").description("Manage branch databases");

  branch.command("list").description("List active branch databases").action(async () => {
    await commandWrapper(
      deps.ui,
      async () => {
        const cwd = deps.cwd();
        const config = await readConfig(cwd, deps.env);
        const spinner = deps.ui.spinner("Loading branch databases...").start();
        const names = await deps.forkEngine.listBranches(config.sourceDatabaseUrl);
        const rows: string[][] = [];

        for (const name of names) {
          const url = withDatabaseName(config.sourceDatabaseUrl, name);
          const healthy = await deps.forkEngine.healthCheck(url);
          rows.push([
            name,
            healthy ? chalk.green("active") : chalk.red("unreachable"),
            chalk.cyan(formatAge(name))
          ]);
        }

        spinner.stop();
        deps.ui.log(renderTable(["name", "status", "age"], rows));
      },
      deps.exit
    );
  });

  branch
    .command("reset")
    .argument("<name>", "Branch name or branch database name")
    .description("Tear down and re-fork a branch database")
    .action(async (name: string) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const cwd = deps.cwd();
          const config = await readConfig(cwd, deps.env);
          const spinner = deps.ui.spinner(`Resetting branch '${name}'...`).start();
          const branchDbName = await resolveBranchDbName(deps.forkEngine, config.sourceDatabaseUrl, name);
          const branchDbUrl = withDatabaseName(config.sourceDatabaseUrl, branchDbName);
          const branchRef = inferBranchRefFromDbName(config.sourceDatabaseUrl, branchDbName);
          await deps.forkEngine.teardown(branchDbUrl);
          const newUrl = await deps.forkEngine.fork(config.sourceDatabaseUrl, branchRef);
          spinner.succeed(`Branch reset complete: ${newUrl}`);
        },
        deps.exit
      );
    });

  program
    .command("diff")
    .argument("<branch>", "Branch name or branch database name")
    .description("Show schema diff between branch and main")
    .action(async (branchName: string) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const cwd = deps.cwd();
          const config = await readConfig(cwd, deps.env);
          const spinner = deps.ui.spinner(`Computing schema diff for '${branchName}'...`).start();
          const { parseMigrations, reconcile } = await loadReconciler();

          const branchDbName = await resolveBranchDbName(deps.forkEngine, config.sourceDatabaseUrl, branchName);
          const branchDbUrl = withDatabaseName(config.sourceDatabaseUrl, branchDbName);

          const all = await parseMigrations(cwd);
          const mainIds = await queryAppliedMigrationIds(config.sourceDatabaseUrl);
          const branchIds = await queryAppliedMigrationIds(branchDbUrl);

          const byId = new Map(all.map((migration) => [migration.id, migration]));
          const mainApplied = [...mainIds].map((id) => byId.get(id)).filter(Boolean) as Migration[];
          const branchOnly = [...branchIds]
            .filter((id) => !mainIds.has(id))
            .map((id) => byId.get(id))
            .filter(Boolean) as Migration[];

          const result = reconcile(branchOnly, mainApplied);
          spinner.stop();

          const rows = branchOnly.map((migration) => {
            const conflict = result.conflicts.find((c) => c.branchMigration.id === migration.id);
            return [
              migration.filename,
              conflict ? chalk.red("conflict") : chalk.green("safe"),
              conflict ? `${conflict.table}.${conflict.column}` : "-"
            ];
          });

          deps.ui.log(renderTable(["migration", "status", "detail"], rows));
          deps.ui.log(
            chalk.blue(
              `Summary: ${result.safe.length} safe migration(s), ${result.conflicts.length} conflict(s).`
            )
          );
        },
        deps.exit
      );
    });

  program
    .command("seed")
    .argument("<branch>", "Branch name or branch database name")
    .argument("[file]", "Seed SQL file path", "seed.sql")
    .description("Run a seed SQL file against a branch database")
    .action(async (branch: string, file: string) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const cwd = deps.cwd();
          const config = await readConfig(cwd, deps.env);
          const seedPath = path.resolve(cwd, file);
          await access(seedPath);

          const branchDbName = await resolveBranchDbName(deps.forkEngine, config.sourceDatabaseUrl, branch);
          const branchDbUrl = withDatabaseName(config.sourceDatabaseUrl, branchDbName);
          const sql = await readFile(seedPath, "utf8");

          const spinner = deps.ui.spinner(`Running seed on '${branchDbName}'...`).start();
          const client = new Client({ connectionString: branchDbUrl });
          await client.connect();
          try {
            await client.query(sql);
          } finally {
            await client.end();
          }

          spinner.succeed("Seed completed.");
        },
        deps.exit
      );
    });

  program.command("status").description("Show branch and migration status").action(async () => {
    await commandWrapper(
      deps.ui,
      async () => {
        const cwd = deps.cwd();
        const config = await readConfig(cwd, deps.env);
        const spinner = deps.ui.spinner("Collecting status...").start();
        const { parseMigrations } = await loadReconciler();

        const branchName = currentGitBranch(cwd);
        const dbHealthy = await deps.forkEngine.healthCheck(config.sourceDatabaseUrl);

        const migrations = await parseMigrations(cwd);
        const appliedIds = await queryAppliedMigrationIds(config.sourceDatabaseUrl);
        const pending = migrations.filter((migration) => !appliedIds.has(migration.id));

        spinner.stop();
        deps.ui.log(chalk.bold("FlowDB Status"));
        deps.ui.log(`current branch: ${chalk.cyan(branchName)}`);
        deps.ui.log(
          `db connection: ${dbHealthy ? chalk.green("connected") : chalk.red("disconnected")}`
        );
        deps.ui.log(`pending migrations: ${chalk.yellow(String(pending.length))}`);
      },
      deps.exit
    );
  });

  return program;
}

export async function runCli(argv: string[], deps?: Partial<CliDeps>): Promise<void> {
  const program = createProgram(deps);
  await program.parseAsync(argv);
}
