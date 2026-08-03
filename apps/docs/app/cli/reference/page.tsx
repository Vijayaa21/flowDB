import { DocsLayout } from "../../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "CLI Reference" };

type CmdDef = {
  cmd: string;
  flags?: string;
  desc: string;
  example?: string;
  notes?: string;
};

function CmdBlock({ def }: { def: CmdDef }) {
  return (
    <div style={{ marginBottom: 36, paddingBottom: 32, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <code style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600, color: "#c4b5fd" }}>
          flowdb {def.cmd}
        </code>
        {def.flags && (
          <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-muted)" }}>
            {def.flags}
          </code>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: def.example ? 12 : 0 }}>{def.desc}</p>
      {def.example && <pre style={{ marginTop: 8 }}>{def.example}</pre>}
      {def.notes && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>{def.notes}</p>
      )}
    </div>
  );
}

export default function CliReferencePage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">CLI</div>
        <h1>Command Reference</h1>
        <p>Every <code>flowdb</code> command, flag, and example.</p>
      </div>

      <h2>Identity commands</h2>

      <CmdBlock def={{
        cmd: "login",
        flags: "--url <url> --api-key <key> --org <slug> --project <slug>",
        desc: "Authenticate with a FlowDB orchestrator. Saves credentials to ~/.flowdb/credentials.json so you don't need to re-authenticate on every command.",
        example: `flowdb login \\
  --url http://localhost:3001 \\
  --api-key my-secure-api-key \\
  --org acme \\
  --project myapp`,
      }} />

      <CmdBlock def={{
        cmd: "logout",
        desc: "Remove saved credentials. After this, commands that need auth will ask you to run flowdb login first.",
        example: `flowdb logout\n# ✓ Credentials removed. You are now logged out.`,
      }} />

      <CmdBlock def={{
        cmd: "whoami",
        desc: "Show the currently saved identity — orchestrator URL, org, project, and auth method with masked key.",
        example: `flowdb whoami\n# FlowDB Identity\n#   Orchestrator : http://localhost:3001\n#   Org          : acme\n#   Project      : myapp\n#   Auth         : api-key my-*****-key\n#   Saved at     : 2026-08-03T10:26:52Z`,
      }} />

      <h2>Connectivity commands</h2>

      <CmdBlock def={{
        cmd: "health",
        desc: "Ping the orchestrator's /health endpoint. Prints status, version, and timestamp.",
        example: `flowdb health\n# ✓ Orchestrator health check passed\n# Status: ok\n# Version: 0.1.0`,
      }} />

      <CmdBlock def={{
        cmd: "status",
        desc: "Show a full dashboard: git branch, orchestrator connectivity, active branch count, and local migration state. Works even without a local project config — just shows less detail.",
        example: `flowdb status\n# FlowDB Status\n# ─────────────────────────────────────────────────\n#   Git branch   : feature/add-payments\n#   Orchestrator : connected (http://localhost:3001 v0.1.0)\n#   Branches     : 2 active\n#   Local config : not found — run 'flowdb init'`,
      }} />

      <CmdBlock def={{
        cmd: "init",
        desc: "Detect your ORM (Prisma, Drizzle, or raw SQL) and write a .flowdb.config.json in the current directory. Required before running migrate, diff, or status with local DB info.",
        example: `flowdb init\n# ✓ Detected ORM: prisma\n# ✓ Wrote .flowdb.config.json`,
      }} />

      <h2>Branch commands</h2>

      <CmdBlock def={{
        cmd: "branch list",
        flags: "[--local]",
        desc: "List all active branches from the orchestrator. Shows branch name, status colour, creation date, and database URL. Use --local to query PostgreSQL directly instead of the orchestrator.",
        example: `flowdb branch list\n# \n#  branch              status   created      url\n#  feature-payments    active   8/3/2026     postgresql://…/flowdb_feature_payments\n#  fix-auth-bug        active   8/3/2026     postgresql://…/flowdb_fix_auth_bug\n# \n# 2 branch(es) — run 'flowdb branch connect <name>' to get the DATABASE_URL`,
      }} />

      <CmdBlock def={{
        cmd: "branch create <name>",
        flags: "[--source-url <url>] [--idempotency-key <key>]",
        desc: "Fork a new branch database from the source database. The branch name is automatically sanitised and prefixed with flowdb_. Branch names can include letters, numbers, slashes, hyphens, and dots.",
        example: `flowdb branch create feature/add-payments\n# ✓ Branch created: feature/add-payments\n# DATABASE_URL: postgresql://…/flowdb_feature_add_payments`,
        notes: "Idempotency key is auto-generated from the branch name if not provided.",
      }} />

      <CmdBlock def={{
        cmd: "branch connect <name>",
        flags: "[--write] [--export]",
        desc: "Look up a branch and print its DATABASE_URL. Use --write to overwrite DATABASE_URL in .env.local in the current directory. Use --export to prefix the output with 'export ' for shell evaluation.",
        example: `# Print to stdout
flowdb branch connect my-feature

# Write to .env.local automatically
flowdb branch connect my-feature --write

# Evaluate in current shell (Unix/macOS)
eval $(flowdb branch connect my-feature --export)`,
      }} />

      <CmdBlock def={{
        cmd: "branch delete <name>",
        flags: "[-y, --yes]",
        desc: "Permanently delete a branch database. Prompts for y/N confirmation unless --yes is passed. Terminates all open connections before dropping the database.",
        example: `flowdb branch delete my-feature\n# ⚠  This will permanently delete branch 'my-feature' and all its data.\n# Delete branch 'my-feature'? [y/N] y\n# ✓ Branch deleted: my-feature\n\n# Skip confirmation (for scripts/CI)\nflowdb branch delete my-feature --yes`,
      }} />

      <CmdBlock def={{
        cmd: "branch reset <name>",
        desc: "Tear down a branch and immediately re-fork it from the source database. Useful when you want a clean slate without losing the branch name.",
        example: `flowdb branch reset my-feature`,
      }} />

      <h2>Database commands</h2>

      <CmdBlock def={{
        cmd: "migrate <branch>",
        flags: "[--migrations-dir <dir>] [--dry-run]",
        desc: "Run pending migration files against a branch database. Migrations are tracked in a flowdb_applied_migrations table on the branch. Each migration runs in a transaction — if it fails, it rolls back and stops. Use --dry-run to preview what would run without applying anything.",
        example: `# Preview pending migrations
flowdb migrate feature/add-payments --dry-run
# 2 pending migration(s) for 'feature/add-payments':
#   + 20240801_add_payments_table.sql
#   + 20240802_add_payment_status.sql

# Apply migrations
flowdb migrate feature/add-payments
# ✓ Applied 20240801_add_payments_table.sql
# ✓ Applied 20240802_add_payment_status.sql
# ✓ Applied 2 migration(s) to branch 'feature/add-payments'.`,
        notes: "ORM is auto-detected from .flowdb.config.json. Prisma → prisma/migrations/, Drizzle → drizzle/, raw → migrations/.",
      }} />

      <CmdBlock def={{
        cmd: "seed <branch> [file]",
        desc: "Execute a SQL seed file against a branch database. If no file is provided, looks for seed.sql in the current directory.",
        example: `flowdb seed feature/add-payments seed/dev-data.sql\n# ✓ Seed applied to branch 'feature/add-payments'`,
      }} />

      <CmdBlock def={{
        cmd: "diff <branch>",
        desc: "Compare the schema of a branch against the main database using the reconciler package. Reports column-level conflicts that would prevent a safe merge. Detects: added columns, dropped columns, type changes, and constraint changes.",
        example: `flowdb diff feature/add-payments\n# Schema diff: feature/add-payments vs main\n# + payments.amount  DECIMAL(10,2)  (new column)\n# + payments.status  TEXT           (new column)\n# No conflicts detected.`,
      }} />
    </DocsLayout>
  );
}
