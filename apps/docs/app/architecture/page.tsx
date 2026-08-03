import { DocsLayout } from "../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Architecture" };

export default function ArchitecturePage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">Architecture</div>
        <h1>Architecture</h1>
        <p>How the FlowDB monorepo is structured and how every package fits together.</p>
      </div>

      <h2>Monorepo layout</h2>
      <pre>{`flowDB/
├── apps/
│   ├── orchestrator/      Hono/Bun REST API — branch lifecycle & auth
│   ├── dashboard/         Next.js web UI — GitHub OAuth & branch management
│   └── docs/              This docs site
├── packages/
│   ├── core/              PostgreSQL TEMPLATE fork engine
│   ├── cli/               flowdb terminal command
│   ├── sdk/               Typed HTTP client for the orchestrator API
│   ├── reconciler/        Migration scanner + schema conflict detection
│   └── load-tester/       Performance testing utilities
├── docs/                  Operational runbooks and project status docs
└── tests/                 Integration test suites`}</pre>

      <h2>Request flow</h2>
      <div className="arch-diagram">{`
  Developer terminal          Browser (dashboard)
        │                            │
   flowdb CLI                 Next.js + NextAuth
        │                            │
        │  Api-Key auth              │  Bearer JWT (GitHub OAuth)
        │                            │
        └─────────────┬──────────────┘
                      │  HTTP
                      ▼
           ┌─────────────────────┐
           │    Orchestrator      │  Hono on Bun · port 3001
           │                     │
           │  authMiddleware      │  validates Api-Key or Bearer JWT
           │  branchRoutes        │  CRUD for branch records
           │  userRoutes          │  /users/sync from dashboard
           │  webhookRoutes       │  GitHub push events
           └──────────┬──────────┘
                      │
           ┌──────────┴──────────┐
           │                     │
    PostgresBranchRepo      ForkEngine
    (flowdb_branches table)  │
    (flowdb_users table)     │  CREATE DATABASE … TEMPLATE
                             │  DROP DATABASE
                             │  pg_database queries
                             ▼
                    PostgreSQL server
                    ┌──────────────────────────────┐
                    │ flowdb_meta       ← meta DB   │
                    │ myproject         ← source DB │
                    │ flowdb_my_feature ← branch    │
                    │ flowdb_fix_bug    ← branch    │
                    └──────────────────────────────┘
`}</div>

      <h2>packages/core — ForkEngine</h2>
      <p>
        The lowest-level package. No framework — just raw <code>pg</code> SQL calls wrapped
        in a clean class interface.
      </p>
      <table className="cmd-table">
        <thead><tr><th>Method</th><th>What it does</th></tr></thead>
        <tbody>
          {[
            ["fork(sourceUrl, branchName)", "CREATE DATABASE flowdb_{name} TEMPLATE {source} — returns new connection URL and fork duration"],
            ["teardown(branchUrl)", "pg_terminate_backend for open connections + DROP DATABASE"],
            ["listBranches(hostUrl)", "Queries pg_database WHERE datname LIKE 'flowdb_%'"],
            ["healthCheck(url)", "SELECT 1 — returns boolean"],
          ].map(([m, d]) => (
            <tr key={m}><td className="cmd">{m}</td><td className="desc">{d}</td></tr>
          ))}
        </tbody>
      </table>

      <p>
        A fork timeout of <strong>5,000ms</strong> is enforced. If the TEMPLATE copy takes
        longer (database too large), the branch is torn down and a <code>ForkTimeoutError</code> is thrown.
      </p>

      <h2>apps/orchestrator — the REST API</h2>
      <p>
        A Hono application. Uses a dependency-injection pattern via <code>OrchestratorDependencies</code>
        — all state (fork engine, branch repository, user repository) is injected at startup, making
        the server fully testable with mocks.
      </p>
      <h3>Key endpoints</h3>
      <table className="cmd-table">
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>
          {[
            ["GET", "/health", "Health check — no auth required"],
            ["POST", "/branches", "Create a branch (envelope format)"],
            ["POST", "/branches/fork", "Create a branch (flat format, CLI-friendly)"],
            ["GET", "/branches", "List active branches for the authenticated user"],
            ["GET", "/branches/:name", "Get a single branch"],
            ["DELETE", "/branches/:name", "Delete a branch"],
            ["POST", "/users/sync", "Upsert user record from GitHub OAuth profile"],
            ["POST", "/webhook/github", "GitHub push event handler"],
          ].map(([m, p, d]) => (
            <tr key={p}>
              <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--green)", padding: "10px 12px" }}>{m}</td>
              <td className="cmd">{p}</td>
              <td className="desc">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Auth middleware</h3>
      <p>Every protected route runs through <code>authMiddleware</code>:</p>
      <ol>
        <li>Checks for <code>x-api-key</code> header or <code>Authorization: Api-Key …</code></li>
        <li>Validates against <code>FLOWDB_API_KEY</code> / <code>FLOWDB_API_KEYS</code> env vars</li>
        <li>Falls back to <code>Authorization: Bearer &lt;jwt&gt;</code> — HMAC-SHA256 verified against <code>AUTH_SECRET</code></li>
        <li>Sets <code>githubId</code> on the request context — used to scope all DB queries</li>
      </ol>

      <h3>Startup migrations</h3>
      <p>
        On boot, the orchestrator scans <code>migrations/*.sql</code> and runs any that
        haven't been applied yet. Currently:
      </p>
      <ul>
        <li><code>001_create_branches.sql</code> — <code>flowdb_branches</code> table</li>
        <li><code>002_create_users.sql</code> — <code>flowdb_users</code> table</li>
      </ul>

      <h2>packages/reconciler — conflict detection</h2>
      <p>
        The reconciler is used by <code>flowdb diff</code>. It:
      </p>
      <ol>
        <li>Scans your project directory for migration files using ORM-specific parsers</li>
        <li>Parses each migration to extract column-level schema changes</li>
        <li>Queries the branch and main databases to compare actual state</li>
        <li>Reports conflicts (same column changed differently in both)</li>
      </ol>

      <h2>packages/sdk — typed HTTP client</h2>
      <p>
        Built for use in CI/CD and test automation. Key design decisions:
      </p>
      <ul>
        <li><strong>withTimeoutAndRetry()</strong> wraps every request — configurable exponential backoff</li>
        <li><strong>FlowDBError</strong> — typed error class with a <code>code</code> discriminant so callers can pattern-match on failure type</li>
        <li><strong>fromEnv()</strong> — zero-config init from environment variables</li>
      </ul>

      <h2>Database naming convention</h2>
      <p>
        Branch database names are auto-generated from the branch name:
      </p>
      <pre>{`"my-feature"         → flowdb_my_feature
"feature/payments"   → flowdb_feature_payments
"PR #123"            → flowdb_pr_123
"my/branch/name"     → flowdb_my_branch_name  (max 63 chars)`}</pre>
      <p>
        The sanitiser lowercases, replaces any non-alphanumeric character with <code>_</code>,
        strips leading/trailing underscores, and prepends <code>flowdb_</code>. The result is
        always a valid PostgreSQL identifier.
      </p>
    </DocsLayout>
  );
}
