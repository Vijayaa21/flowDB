import { DocsLayout } from "../../components/DocsLayout";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "CLI Overview" };

export default function CliOverviewPage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">CLI</div>
        <h1>CLI Overview</h1>
        <p>
          The <code>flowdb</code> CLI is your day-to-day tool for creating, managing, and connecting
          to database branches from any terminal.
        </p>
      </div>

      <h2>Installation</h2>
      <h3>Windows (PowerShell profile — recommended for this repo)</h3>
      <p>Add this function to your PowerShell profile (<code>$PROFILE</code>):</p>
      <pre>{`# ~/.flowdb/credentials.json stores your login
function flowdb {
    $repoRoot = "D:\\path\\to\\flowDB"
    & bun "$repoRoot\\packages\\cli\\src\\index.ts" @args
}`}</pre>
      <p>Then reload: <code>. $PROFILE</code></p>

      <h3>Any OS (run from repo root)</h3>
      <pre>{`bun run flowdb -- <command> [args]

# examples
bun run flowdb -- status
bun run flowdb -- branch list`}</pre>

      <h3>Direct (no alias)</h3>
      <pre>{`bun packages/cli/src/index.ts <command> [args]`}</pre>

      <h2>Authentication</h2>
      <p>
        The CLI uses API key authentication. Run <code>flowdb login</code> once and credentials
        are saved to <code>~/.flowdb/credentials.json</code>.
      </p>
      <pre>{`flowdb login \\
  --url http://localhost:3001 \\
  --api-key your-api-key \\
  --org your-org \\
  --project your-project`}</pre>
      <p>After that, every command picks up the saved credentials automatically.</p>

      <h2>Command groups</h2>
      <div className="cards">
        <div className="card">
          <div className="card-icon">🔑</div>
          <div className="card-title">Identity</div>
          <div className="card-desc"><code>login</code> · <code>logout</code> · <code>whoami</code></div>
        </div>
        <div className="card">
          <div className="card-icon">🌿</div>
          <div className="card-title">Branch management</div>
          <div className="card-desc"><code>branch list</code> · <code>create</code> · <code>delete</code> · <code>connect</code> · <code>reset</code></div>
        </div>
        <div className="card">
          <div className="card-icon">🗄️</div>
          <div className="card-title">Database operations</div>
          <div className="card-desc"><code>migrate</code> · <code>seed</code> · <code>diff</code></div>
        </div>
        <div className="card">
          <div className="card-icon">📊</div>
          <div className="card-title">Status</div>
          <div className="card-desc"><code>health</code> · <code>status</code> · <code>init</code></div>
        </div>
      </div>

      <p>
        See the <Link href="/cli/reference">full command reference →</Link>
      </p>

      <h2>Typical workflow</h2>
      <pre>{`# 1. Start work on a feature
git checkout -b feature/add-payments
flowdb branch create feature/add-payments

# 2. Connect your app to the branch
flowdb branch connect feature/add-payments --write
# → writes DATABASE_URL to .env.local

# 3. Run pending migrations on the branch
flowdb migrate feature/add-payments --dry-run   # preview
flowdb migrate feature/add-payments             # apply

# 4. Seed test data
flowdb seed feature/add-payments seed/payments.sql

# 5. Check for schema conflicts
flowdb diff feature/add-payments

# 6. Done — clean up
flowdb branch delete feature/add-payments`}</pre>

      <h2>Environment variable overrides</h2>
      <p>
        Instead of <code>flowdb login</code>, you can configure the CLI via environment variables.
        These take precedence over saved credentials.
      </p>
      <table className="cmd-table">
        <thead>
          <tr><th>Variable</th><th>Description</th></tr>
        </thead>
        <tbody>
          {[
            ["FLOWDB_ORCHESTRATOR_URL", "Orchestrator base URL"],
            ["FLOWDB_API_KEY", "API key for authentication"],
            ["FLOWDB_ORG_SLUG", "Organization identifier"],
            ["FLOWDB_PROJECT_SLUG", "Project identifier"],
          ].map(([k, v]) => (
            <tr key={k}>
              <td className="cmd">{k}</td>
              <td className="desc">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocsLayout>
  );
}
