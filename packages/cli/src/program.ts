import { execSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import readline from "node:readline";

import chalk from "chalk";
import { Command } from "commander";
import ora, { type Ora } from "ora";
import { Client } from "pg";

import { PostgreSQLForkEngine as ForkEngine } from "@flowdb/core";
import { OrchestratorClient, type OrchestratorConfig } from "./orchestrator-client";
import { CredentialManager, type Credentials } from "./credential-manager";

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
  orchestratorClient?: OrchestratorClient;
  credentialManager?: CredentialManager;
};

const CONFIG_FILE = ".flowdb.config.json";

function defaultDeps(): CliDeps {
  return {
    cwd: () => process.cwd(),
    env: process.env,
    ui: {
      log: console.log,
      error: console.error,
      spinner: (text) => ora(text),
    },
    exit: (code) => {
      process.exitCode = code;
    },
    forkEngine: new ForkEngine(),
    credentialManager: new CredentialManager(),
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
  const renderRow = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0, " ")).join("  ");
  return [
    renderRow(headers),
    renderRow(widths.map((w) => "-".repeat(w))),
    ...rows.map(renderRow),
  ].join("\n");
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
    ["unknown", 0],
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
      sourceDatabaseUrl: env.DATABASE_URL,
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
  const branchNames = branches.map((branch) => branch.name);

  if (branchNames.includes(inputName)) {
    return inputName;
  }

  const sanitizedInput = inputName.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const fuzzy = branchNames.find((name) => name.includes(`_${sanitizedInput}_`));
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

/**
 * Prompts the user for a y/N confirmation on stdin.
 * Returns true if the user types 'y' or 'yes' (case-insensitive).
 */
function askConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

function loadOrchestratorConfig(
  env: NodeJS.ProcessEnv,
  credentialManager?: CredentialManager
): OrchestratorConfig | null {
  // Try environment variables first
  const envConfig = OrchestratorClient.fromEnv(env);
  if (envConfig) {
    return envConfig;
  }

  // Try credentials file
  if (credentialManager) {
    const credentials = credentialManager.loadCredentials();
    if (credentials) {
      return {
        apiUrl: credentials.apiUrl,
        apiKey: credentials.apiKey,
        jwtToken: credentials.jwtToken,
        orgSlug: credentials.orgSlug,
        projectSlug: credentials.projectSlug,
      };
    }
  }

  return null;
}

export function createProgram(inputDeps?: Partial<CliDeps>): Command {
  const deps = { ...defaultDeps(), ...inputDeps };

  const program = new Command();
  program.name("flowdb").description("FlowDB CLI").showHelpAfterError();

  program
    .command("init")
    .description("Detect ORM and initialize FlowDB config")
    .action(async () => {
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
            sourceDatabaseUrl: databaseUrl,
          };

          await writeFile(
            path.join(cwd, CONFIG_FILE),
            `${JSON.stringify(config, null, 2)}\n`,
            "utf8"
          );
          await writeEnvLocal(cwd, databaseUrl);
          spinner.succeed("FlowDB initialized.");
          deps.ui.log(chalk.green(`Detected ORM: ${orm}`));
        },
        deps.exit
      );
    });

  program
    .command("login")
    .description("Authenticate with FlowDB orchestrator")
    .option("-u, --url <url>", "Orchestrator API URL")
    .option("-k, --api-key <key>", "API key for authentication")
    .option("--org <org>", "Organization slug")
    .option("--project <project>", "Project slug")
    .action(async (options: { url?: string; apiKey?: string; org?: string; project?: string }) => {
      await commandWrapper(
        deps.ui,
        async () => {
          if (!deps.credentialManager) {
            throw new Error("Credential manager not available");
          }

          const apiUrl = options.url || deps.env.FLOWDB_ORCHESTRATOR_URL;
          const orgSlug = options.org || deps.env.FLOWDB_ORG_SLUG;
          const projectSlug = options.project || deps.env.FLOWDB_PROJECT_SLUG;
          const apiKey = options.apiKey || deps.env.FLOWDB_API_KEY;

          if (!apiUrl) {
            throw new Error(
              "Orchestrator API URL is required. Use -u/--url or set FLOWDB_ORCHESTRATOR_URL"
            );
          }

          if (!orgSlug) {
            throw new Error("Organization slug is required. Use --org or set FLOWDB_ORG_SLUG");
          }

          if (!projectSlug) {
            throw new Error("Project slug is required. Use --project or set FLOWDB_PROJECT_SLUG");
          }

          if (!apiKey) {
            throw new Error("API key is required. Use -k/--api-key or set FLOWDB_API_KEY");
          }

          const spinner = deps.ui.spinner("Testing connection to orchestrator...").start();

          try {
            const client = new OrchestratorClient({
              apiUrl,
              apiKey,
              orgSlug,
              projectSlug,
            });

            const health = await client.health();
            spinner.succeed(`Connected to orchestrator (version: ${health.version})`);

            deps.credentialManager.saveCredentials({
              apiUrl,
              apiKey,
              orgSlug,
              projectSlug,
            });

            deps.ui.log(chalk.green("Credentials saved to ~/.flowdb/credentials.json"));
          } catch (error) {
            spinner.fail();
            throw error;
          }
        },
        deps.exit
      );
    });

  // ─── logout ────────────────────────────────────────────────────────────────
  program
    .command("logout")
    .description("Remove saved FlowDB credentials")
    .action(async () => {
      await commandWrapper(
        deps.ui,
        async () => {
          if (!deps.credentialManager) {
            throw new Error("Credential manager not available");
          }

          if (!deps.credentialManager.hasCredentials()) {
            deps.ui.log(chalk.yellow("No saved credentials found — already logged out."));
            return;
          }

          deps.credentialManager.deleteCredentials();
          deps.ui.log(chalk.green("✓ Credentials removed. You are now logged out."));
        },
        deps.exit
      );
    });

  // ─── whoami ────────────────────────────────────────────────────────────────
  program
    .command("whoami")
    .description("Show the current FlowDB login identity")
    .action(async () => {
      await commandWrapper(
        deps.ui,
        async () => {
          if (!deps.credentialManager) {
            throw new Error("Credential manager not available");
          }

          const creds = deps.credentialManager.loadCredentials();
          if (!creds) {
            deps.ui.log(chalk.yellow("Not logged in. Run 'flowdb login' first."));
            return;
          }

          deps.ui.log(chalk.bold("FlowDB Identity"));
          deps.ui.log(`  Orchestrator : ${chalk.cyan(creds.apiUrl)}`);
          deps.ui.log(`  Org          : ${chalk.cyan(creds.orgSlug)}`);
          deps.ui.log(`  Project      : ${chalk.cyan(creds.projectSlug)}`);
          if (creds.apiKey) {
            const masked = `${creds.apiKey.slice(0, 4)}${"".padEnd(creds.apiKey.length - 8, "*")}${creds.apiKey.slice(-4)}`;
            deps.ui.log(`  Auth         : api-key ${chalk.cyan(masked)}`);
          } else if (creds.jwtToken) {
            deps.ui.log(`  Auth         : ${chalk.cyan("jwt token")}`);
          }
          deps.ui.log(`  Saved at     : ${chalk.dim(creds.updatedAt)}`);
        },
        deps.exit
      );
    });

  // ─── health ────────────────────────────────────────────────────────────────
  program
    .command("health")
    .description("Check orchestrator health")
    .action(async () => {
      await commandWrapper(
        deps.ui,
        async () => {
          const orchConfig = loadOrchestratorConfig(deps.env, deps.credentialManager);
          if (!orchConfig) {
            throw new Error("Orchestrator not configured. Run 'flowdb login' first.");
          }

          const client = new OrchestratorClient(orchConfig);
          const spinner = deps.ui.spinner("Checking orchestrator health...").start();

          try {
            const health = await client.health();
            spinner.succeed("Orchestrator health check passed");
            deps.ui.log(chalk.green(`Status: ${health.status}`));
            deps.ui.log(chalk.green(`Version: ${health.version}`));
            deps.ui.log(chalk.green(`Timestamp: ${health.timestamp}`));
          } catch (error) {
            spinner.fail();
            throw error;
          }
        },
        deps.exit
      );
    });

  const branch = program.command("branch").description("Manage branch databases");

  branch
    .command("list")
    .description("List active branch databases")
    .option("--local", "Use local fork engine instead of orchestrator")
    .action(async (options: { local?: boolean }) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const orchConfig = !options.local
            ? loadOrchestratorConfig(deps.env, deps.credentialManager)
            : null;

          // ── Orchestrator path ────────────────────────────────────────────
          if (orchConfig) {
            const client = new OrchestratorClient(orchConfig);
            const spinner = deps.ui.spinner("Fetching branches from orchestrator...").start();

            let response: Awaited<ReturnType<typeof client.listBranches>>;
            try {
              response = await client.listBranches(100);
              spinner.stop();
            } catch (error) {
              spinner.fail("Failed to reach orchestrator");
              throw error;
            }

            const items = response.items ?? [];
            if (items.length === 0) {
              deps.ui.log(chalk.yellow("No active branches found."));
              deps.ui.log(
                chalk.dim("  Create one with: flowdb branch create <name>")
              );
              return;
            }

            const rows = items.map((b) => {
              const statusColor =
                b.status === "active"
                  ? chalk.green(b.status)
                  : b.status === "failed"
                    ? chalk.red(b.status)
                    : chalk.yellow(b.status ?? "unknown");

              const age = b.createdAt
                ? chalk.cyan(new Date(b.createdAt).toLocaleDateString())
                : chalk.dim("unknown");

              return [b.name, statusColor, age, chalk.dim(b.databaseUrl ?? "—")];
            });

            deps.ui.log("");
            deps.ui.log(renderTable(["branch", "status", "created", "url"], rows));
            deps.ui.log(
              chalk.dim(
                `\n${items.length} branch(es) — run 'flowdb branch connect <name>' to get the DATABASE_URL`
              )
            );
            return;
          }

          // ── Local fork engine fallback ──────────────────────────────────
          const cwd = deps.cwd();
          const config = await readConfig(cwd, deps.env);
          const spinner = deps.ui.spinner("Scanning local branch databases...").start();

          const branches = await deps.forkEngine.listBranches(config.sourceDatabaseUrl);
          const rows: string[][] = [];

          for (const b of branches) {
            const url = withDatabaseName(config.sourceDatabaseUrl, b.name);
            const healthy = await deps.forkEngine.healthCheck(url);
            rows.push([
              b.name,
              healthy ? chalk.green("active") : chalk.red("unreachable"),
              chalk.cyan(formatAge(b.name)),
            ]);
          }

          spinner.stop();

          if (rows.length === 0) {
            deps.ui.log(chalk.yellow("No local branch databases found."));
            deps.ui.log(
              chalk.dim("  Tip: Run 'flowdb login' to connect to an orchestrator.")
            );
            return;
          }

          deps.ui.log(renderTable(["branch", "status", "age"], rows));
        },
        deps.exit
      );
    });


  branch
    .command("create")
    .argument("<name>", "Branch name")
    .option(
      "--source-url <url>",
      "Source database URL (optional, uses main database if not provided)"
    )
    .description("Create a new branch database")
    .action(async (name: string, options: { sourceUrl?: string }) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const orchConfig = loadOrchestratorConfig(deps.env, deps.credentialManager);

          if (!orchConfig) {
            throw new Error("Orchestrator not configured. Run 'flowdb login' first.");
          }

          const client = new OrchestratorClient(orchConfig);
          const spinner = deps.ui.spinner(`Creating branch '${name}'...`).start();

          try {
            const idempotencyKey = randomUUID();
            const response = await client.createBranch(name, idempotencyKey, options.sourceUrl);
            spinner.succeed(`Branch created: ${name}`);
            deps.ui.log(chalk.green(`Branch ID: ${response.branch.id}`));
            deps.ui.log(chalk.green(`Status: ${response.operation.status}`));
            if (response.branch.databaseUrl) {
              deps.ui.log(chalk.green(`Database URL: ${response.branch.databaseUrl}`));
            }
          } catch (error) {
            spinner.fail();
            throw error;
          }
        },
        deps.exit
      );
    });

  branch
    .command("delete")
    .argument("<name>", "Branch name")
    .description("Delete a branch database")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name: string, options: { yes?: boolean }) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const orchConfig = loadOrchestratorConfig(deps.env, deps.credentialManager);

          if (!orchConfig) {
            throw new Error("Orchestrator not configured. Run 'flowdb login' first.");
          }

          if (!options.yes) {
            deps.ui.log(
              chalk.yellow(
                `⚠  This will permanently delete branch '${name}' and all its data. This cannot be undone.`
              )
            );
            const confirmed = await askConfirm(`Delete branch '${name}'?`);
            if (!confirmed) {
              deps.ui.log(chalk.dim("Aborted."));
              return;
            }
          }

          const client = new OrchestratorClient(orchConfig);
          const spinner = deps.ui.spinner(`Deleting branch '${name}'...`).start();

          try {
            await client.deleteBranch(name);
            spinner.succeed(`Branch deleted: ${chalk.bold(name)}`);
          } catch (error) {
            spinner.fail();
            throw error;
          }
        },
        deps.exit
      );
    });

  // ─── branch connect ────────────────────────────────────────────────────────
  branch
    .command("connect")
    .argument("<name>", "Branch name")
    .description("Print the DATABASE_URL for a branch so you can paste it into .env.local")
    .option("--export", "Prefix output with 'export ' for shell eval")
    .option("--write", "Write DATABASE_URL directly to .env.local in the current directory")
    .action(async (name: string, options: { export?: boolean; write?: boolean }) => {
      await commandWrapper(
        deps.ui,
        async () => {
          const orchConfig = loadOrchestratorConfig(deps.env, deps.credentialManager);

          if (!orchConfig) {
            throw new Error("Orchestrator not configured. Run 'flowdb login' first.");
          }

          const client = new OrchestratorClient(orchConfig);
          const spinner = deps.ui.spinner(`Looking up branch '${name}'...`).start();

          let databaseUrl: string | undefined;

          try {
            const response = await client.listBranches(100);
            const match = (response.items ?? []).find(
              (b) => b.name === name
            );

            if (!match) {
              spinner.fail();
              throw new Error(
                `Branch '${name}' not found. Run 'flowdb branch list' to see available branches.`
              );
            }

            databaseUrl = match.databaseUrl;
            spinner.stop();
          } catch (error) {
            spinner.fail();
            throw error;
          }

          if (!databaseUrl) {
            throw new Error(
              `Branch '${name}' found but has no database URL yet. It may still be creating.`
            );
          }

          if (options.write) {
            const cwd = deps.cwd();
            await writeEnvLocal(cwd, databaseUrl);
            deps.ui.log(
              chalk.green(`✓ DATABASE_URL written to ${chalk.bold(".env.local")} in ${cwd}`)
            );
            deps.ui.log(chalk.dim(`  ${databaseUrl}`));
            return;
          }

          const line = options.export
            ? `export DATABASE_URL="${databaseUrl}"`
            : `DATABASE_URL="${databaseUrl}"`;

          deps.ui.log("");
          deps.ui.log(chalk.bold(`Branch: ${name}`));
          deps.ui.log(chalk.dim("──────────────────────────────────────────────"));
          deps.ui.log(chalk.cyan(line));
          deps.ui.log(chalk.dim("──────────────────────────────────────────────"));
          deps.ui.log("");
          deps.ui.log(chalk.dim("Copy the line above into your .env.local, or:"));
          deps.ui.log(
            chalk.dim(`  Run 'flowdb branch connect ${name} --write' to write it automatically.`)
          );
          deps.ui.log(
            chalk.dim(`  Run 'eval $(flowdb branch connect ${name} --export)' to set it in your shell.`)
          );
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
          const branchDbName = await resolveBranchDbName(
            deps.forkEngine,
            config.sourceDatabaseUrl,
            name
          );
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

          const branchDbName = await resolveBranchDbName(
            deps.forkEngine,
            config.sourceDatabaseUrl,
            branchName
          );
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
              conflict ? `${conflict.table}.${conflict.column}` : "-",
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

          const branchDbName = await resolveBranchDbName(
            deps.forkEngine,
            config.sourceDatabaseUrl,
            branch
          );
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

  // ─── migrate ───────────────────────────────────────────────────────────────
  program
    .command("migrate")
    .argument("<branch>", "Branch name or branch database name")
    .description("Run pending migrations from your project against a branch database")
    .option(
      "--migrations-dir <dir>",
      "Path to migrations directory (default: auto-detected by ORM)"
    )
    .option("--dry-run", "Show which migrations would run without applying them")
    .action(
      async (branchName: string, options: { migrationsDir?: string; dryRun?: boolean }) => {
        await commandWrapper(
          deps.ui,
          async () => {
            const cwd = deps.cwd();
            const config = await readConfig(cwd, deps.env);
            const spinner = deps
              .ui
              .spinner(`Resolving branch database for '${branchName}'...`)
              .start();

            const branchDbName = await resolveBranchDbName(
              deps.forkEngine,
              config.sourceDatabaseUrl,
              branchName
            );
            const branchDbUrl = withDatabaseName(config.sourceDatabaseUrl, branchDbName);

            // Resolve migrations directory
            const { parseMigrations } = await loadReconciler();
            const migrationsDir =
              options.migrationsDir ??
              (() => {
                if (config.orm === "prisma") return path.join(cwd, "prisma", "migrations");
                if (config.orm === "drizzle") return path.join(cwd, "drizzle");
                return path.join(cwd, "migrations");
              })();

            spinner.text = `Scanning migrations in ${migrationsDir}...`;
            const allMigrations = await parseMigrations(cwd);

            // Find which migrations are already applied on the branch
            const appliedIds = await queryAppliedMigrationIds(branchDbUrl);
            const pending = allMigrations.filter((m) => !appliedIds.has(m.id));

            spinner.stop();

            if (pending.length === 0) {
              deps.ui.log(chalk.green(`✓ Branch '${branchName}' is up to date. No pending migrations.`));
              return;
            }

            deps.ui.log(chalk.bold(`\n${pending.length} pending migration(s) for '${branchName}':`));
            for (const migration of pending) {
              deps.ui.log(`  ${chalk.cyan("+")} ${migration.filename}`);
            }
            deps.ui.log("");

            if (options.dryRun) {
              deps.ui.log(chalk.yellow("Dry run — no migrations applied."));
              return;
            }

            // Apply migrations one by one
            const client = new (await import("pg")).Client({ connectionString: branchDbUrl });
            await client.connect();

            let applied = 0;
            try {
              await client.query(`
                CREATE TABLE IF NOT EXISTS flowdb_applied_migrations (
                  id TEXT PRIMARY KEY,
                  filename TEXT NOT NULL,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
              `);

              for (const migration of pending) {
                const migrateSpinner = deps.ui
                  .spinner(`Applying ${migration.filename}...`)
                  .start();
                try {
                  await client.query("BEGIN");
                  await client.query(migration.sql);
                  await client.query(
                    "INSERT INTO flowdb_applied_migrations (id, filename) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    [migration.id, migration.filename]
                  );
                  await client.query("COMMIT");
                  migrateSpinner.succeed(`Applied ${chalk.bold(migration.filename)}`);
                  applied++;
                } catch (err) {
                  await client.query("ROLLBACK");
                  migrateSpinner.fail(`Failed: ${migration.filename}`);
                  throw err;
                }
              }
            } finally {
              await client.end();
            }

            deps.ui.log("");
            deps.ui.log(
              chalk.green(`✓ Applied ${applied} migration(s) to branch '${branchName}'.`)
            );
          },
          deps.exit
        );
      }
    );

  program
    .command("status")
    .description("Show connection and migration status")
    .action(async () => {
      await commandWrapper(
        deps.ui,
        async () => {
          const cwd = deps.cwd();
          const gitBranch = currentGitBranch(cwd);

          deps.ui.log(chalk.bold("FlowDB Status"));
          deps.ui.log(chalk.dim("─────────────────────────────────────────────────"));
          deps.ui.log(`  Git branch   : ${chalk.cyan(gitBranch)}`);

          // ── Orchestrator connectivity ──────────────────────────────────
          const orchConfig = loadOrchestratorConfig(deps.env, deps.credentialManager);
          if (orchConfig) {
            const client = new OrchestratorClient(orchConfig);
            try {
              const health = await client.health();
              deps.ui.log(
                `  Orchestrator : ${chalk.green("connected")} ${chalk.dim(`(${orchConfig.apiUrl} v${health.version})`)}`
              );
              const branches = await client.listBranches(100);
              const active = (branches.items ?? []).filter((b) => b.status === "active");
              deps.ui.log(
                `  Branches     : ${chalk.cyan(String(active.length))} active`
              );
            } catch {
              deps.ui.log(
                `  Orchestrator : ${chalk.red("unreachable")} ${chalk.dim(`(${orchConfig.apiUrl})`)}`
              );
            }
          } else {
            deps.ui.log(
              `  Orchestrator : ${chalk.yellow("not configured")} ${chalk.dim("— run 'flowdb login'")}`
            );
          }

          // ── Local project config & migrations ─────────────────────────
          let config: Awaited<ReturnType<typeof readConfig>> | null = null;
          try {
            config = await readConfig(cwd, deps.env);
          } catch {
            deps.ui.log(
              `  Local config : ${chalk.yellow("not found")} ${chalk.dim("— run 'flowdb init'")}`
            );
            deps.ui.log(chalk.dim("─────────────────────────────────────────────────"));
            return;
          }

          deps.ui.log(chalk.dim("─────────────────────────────────────────────────"));

          const spinner = deps.ui.spinner("Checking local database and migrations...").start();
          const dbHealthy = await deps.forkEngine.healthCheck(config.sourceDatabaseUrl);
          spinner.text = "Scanning migrations...";

          const { parseMigrations } = await loadReconciler();
          const migrations = await parseMigrations(cwd);
          const appliedIds = await queryAppliedMigrationIds(config.sourceDatabaseUrl);
          const pending = migrations.filter((m) => !appliedIds.has(m.id));

          spinner.stop();

          deps.ui.log(chalk.bold("  Local project"));
          deps.ui.log(
            `  DB source    : ${dbHealthy ? chalk.green("connected") : chalk.red("disconnected")}`
          );
          deps.ui.log(`  ORM          : ${chalk.cyan(config.orm)}`);
          deps.ui.log(
            `  Migrations   : ${chalk.cyan(String(migrations.length))} total, ${
              pending.length > 0
                ? chalk.yellow(`${pending.length} pending`)
                : chalk.green("all applied")
            }`
          );

          if (pending.length > 0) {
            deps.ui.log(chalk.dim("  Pending:"));
            for (const m of pending) {
              deps.ui.log(`    ${chalk.yellow("+")} ${m.filename}`);
            }
          }
          deps.ui.log(chalk.dim("─────────────────────────────────────────────────"));
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
