import { DocsLayout } from "../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "How It Works" };

export default function HowItWorksPage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">Concepts</div>
        <h1>How FlowDB Works</h1>
        <p>
          FlowDB makes instant database copies possible using a PostgreSQL feature that most
          teams never reach for. Here's the complete picture.
        </p>
      </div>

      <h2>The core trick: PostgreSQL TEMPLATE</h2>
      <p>
        PostgreSQL has a built-in mechanism for creating a new database as an <strong>exact
        copy of an existing one</strong> — the <code>TEMPLATE</code> clause of <code>CREATE DATABASE</code>:
      </p>

      <pre>{`CREATE DATABASE flowdb_my_feature
  TEMPLATE myproject_main;`}</pre>

      <p>
        This isn't a dump-and-restore. PostgreSQL copies the data files directly at the
        filesystem level. For a typical development database (a few hundred MB), this completes
        in <strong>under 500 milliseconds</strong>.
      </p>

      <div className="callout info">
        <span className="callout-icon">ℹ️</span>
        <div className="callout-body">
          <strong>Why is TEMPLATE so fast?</strong>
          PostgreSQL's <code>CREATE DATABASE … TEMPLATE</code> copies the database at the
          storage layer — not row by row. It's essentially a filesystem-level clone, which
          is orders of magnitude faster than <code>pg_dump | pg_restore</code>.
        </div>
      </div>

      <h2>Branch lifecycle</h2>
      <p>
        Every branch goes through a predictable state machine managed by the orchestrator:
      </p>

      <div className="arch-diagram">{`  flowdb branch create my-feature
          │
          ▼
    ┌─────────────┐
    │   creating  │  ← orchestrator calls ForkEngine.fork()
    └─────────────┘
          │   CREATE DATABASE flowdb_my_feature TEMPLATE main_db
          ▼
    ┌─────────────┐
    │    active   │  ← branch is live, DATABASE_URL is available
    └─────────────┘
          │
          ▼
  flowdb branch delete my-feature
          │
          ▼
    ┌──────────────┐
    │ tearing_down │  ← terminate connections, then DROP DATABASE
    └──────────────┘
          │
          ▼
    ┌─────────────┐
    │   deleted   │
    └─────────────┘`}</div>

      <h2>System architecture</h2>
      <p>
        FlowDB is a layered system. Each layer has a single responsibility:
      </p>

      <div className="arch-diagram">{`  Developer / CI
       │
       ├─── Dashboard (Next.js)        ← GitHub OAuth, branch UI
       │         │
       │         │ Bearer JWT
       │         ▼
       └─── CLI (flowdb)               ← Api-Key or JWT
                 │
                 │ HTTP
                 ▼
         Orchestrator API (Hono/Bun)
                 │
         ┌───────┴───────┐
         │               │
    BranchRepo      ForkEngine
  (PostgreSQL)    (pg: CREATE DB TEMPLATE)
                         │
                ┌────────┴────────┐
                │                 │
         Source DB          Branch DBs
         (myproject)     (flowdb_my_feature,
                          flowdb_fix_bug, …)`}</div>

      <h2>The five packages</h2>

      <h3>packages/core — ForkEngine</h3>
      <p>
        The lowest-level package. <code>ForkEngine</code> wraps raw <code>pg</code> SQL calls:
      </p>
      <ul>
        <li><strong>fork(sourceUrl, branchName)</strong> — issues <code>CREATE DATABASE … TEMPLATE</code>, enforces a 5-second timeout, returns the new connection URL</li>
        <li><strong>teardown(branchUrl)</strong> — terminates open connections then drops the database</li>
        <li><strong>listBranches(hostUrl)</strong> — queries <code>pg_database</code> for all <code>flowdb_*</code> databases</li>
        <li><strong>healthCheck(url)</strong> — runs <code>SELECT 1</code></li>
      </ul>
      <p>
        Branch database names are auto-sanitised and capped at 63 characters
        (PostgreSQL's identifier limit): <code>flowdb_{"{"}sanitized_name{"}"}</code>.
      </p>

      <h3>apps/orchestrator — the API</h3>
      <p>
        A Hono application running on Bun. It:
      </p>
      <ul>
        <li>Persists branch records in a <code>flowdb_branches</code> PostgreSQL table</li>
        <li>Persists user records in a <code>flowdb_users</code> table (synced from GitHub OAuth)</li>
        <li>Authenticates requests via <strong>Bearer JWT</strong> (from the dashboard) or <strong>Api-Key</strong> (from the CLI)</li>
        <li>Runs startup migrations automatically from <code>migrations/*.sql</code></li>
        <li>Exposes a GitHub webhook endpoint for automated branch management</li>
      </ul>

      <h3>packages/reconciler — conflict detection</h3>
      <p>
        Scans your project's migration files (Prisma, Drizzle, or raw SQL) and compares
        the schema of a branch against the main database. Reports column-level conflicts
        that would prevent a safe merge.
      </p>

      <h3>packages/sdk — JavaScript/TypeScript client</h3>
      <p>
        A typed HTTP client for the orchestrator API, designed for use in CI/CD pipelines
        and application code. Supports automatic retry with exponential backoff, configurable
        timeouts, and typed error classes.
      </p>

      <h3>packages/cli — the flowdb command</h3>
      <p>
        A terminal tool built with Commander.js. Saves credentials in <code>~/.flowdb/credentials.json</code>,
        detects your ORM automatically, and proxies all branch operations through the orchestrator.
      </p>

      <h2>Authentication flow</h2>
      <p>FlowDB uses two auth mechanisms in parallel:</p>

      <h3>Dashboard → Orchestrator (Bearer JWT)</h3>
      <div className="steps">
        <div className="step">
          <div className="step-content">
            <h4>GitHub OAuth sign-in</h4>
            <p>User clicks "Sign in with GitHub". NextAuth handles the OAuth flow and stores a session.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>JWT minted</h4>
            <p>NextAuth's JWT callback embeds the user's GitHub ID into the session token.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>User sync</h4>
            <p>The dashboard POSTs to <code>/users/sync</code> with the GitHub profile. The orchestrator upserts a <code>flowdb_users</code> record.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Authenticated requests</h4>
            <p>Every branch API call forwards the JWT as <code>Authorization: Bearer &lt;token&gt;</code>. The orchestrator verifies the HMAC-SHA256 signature and extracts the GitHub ID.</p>
          </div>
        </div>
      </div>

      <h3>CLI → Orchestrator (Api-Key)</h3>
      <p>
        The CLI stores an API key in <code>~/.flowdb/credentials.json</code> after
        <code>flowdb login</code>. Each request sends <code>Authorization: Api-Key &lt;key&gt;</code>.
        The orchestrator checks it against the <code>FLOWDB_API_KEY</code> environment variable.
      </p>

      <div className="callout tip">
        <span className="callout-icon">💡</span>
        <div className="callout-body">
          <strong>Branch ownership</strong>
          Branches are scoped to the GitHub ID of the authenticated user. The dashboard only shows
          branches belonging to the signed-in user. The CLI uses the <code>FLOWDB_API_KEY_OWNER</code>
          env var as the owner identity for API-key-authenticated requests.
        </div>
      </div>

      <h2>What happens when you fork</h2>
      <p>Let's trace <code>flowdb branch create my-feature</code> end to end:</p>
      <pre>{`1. CLI reads ~/.flowdb/credentials.json
2. POST /branches/fork  {branchName: "my-feature", sourceDatabaseUrl: "..."}
   Authorization: Api-Key dev-api-key

3. Orchestrator auth middleware validates the key
4. ForkEngine.fork("postgresql://…/myproject", "my-feature")
   → CREATE DATABASE "flowdb_my_feature" TEMPLATE "myproject"
   → completes in ~200–800ms depending on DB size

5. Orchestrator saves to flowdb_branches table
6. Returns {branch: {name, databaseUrl, status: "active", …}}

7. CLI prints:
   ✓ Branch created: my-feature
   DATABASE_URL: postgresql://…/flowdb_my_feature`}</pre>
    </DocsLayout>
  );
}
