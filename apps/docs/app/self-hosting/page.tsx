import { DocsLayout } from "../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Self-Hosting" };

export default function SelfHostingPage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">Deployment</div>
        <h1>Self-Hosting</h1>
        <p>
          Deploy the FlowDB orchestrator and dashboard on your own infrastructure.
          Both services are stateless — all state lives in PostgreSQL.
        </p>
      </div>

      <div className="callout tip">
        <span className="callout-icon">💡</span>
        <div className="callout-body">
          <strong>Recommended free tier</strong> — Deploy on Railway, Render, or Fly.io.
          Each offers free tiers that cover a small FlowDB instance. Vercel works for the
          dashboard. Neon or Supabase work well for the managed PostgreSQL requirement.
        </div>
      </div>

      <h2>What you need</h2>
      <ul>
        <li><strong>PostgreSQL 14+</strong> — one instance for metadata + source database(s)</li>
        <li><strong>A server for the orchestrator</strong> — any Node.js/Bun runtime (Railway, Fly.io, Render, AWS EC2, etc.)</li>
        <li><strong>A server for the dashboard</strong> — Next.js-compatible host (Vercel recommended)</li>
        <li><strong>A GitHub OAuth App</strong> — for user authentication</li>
      </ul>

      <h2>Environment variables</h2>

      <h3>Orchestrator</h3>
      <table className="cmd-table">
        <thead><tr><th>Variable</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          {[
            ["PORT", "no", "Port to listen on. Default: 3001"],
            ["DATABASE_URL", "yes", "PostgreSQL URL for FlowDB metadata (flowdb_branches, flowdb_users tables)"],
            ["SOURCE_DATABASE_URL", "yes", "PostgreSQL URL for the database to branch from"],
            ["AUTH_SECRET", "yes", "64-char hex secret — MUST match dashboard AUTH_SECRET"],
            ["GITHUB_WEBHOOK_SECRET", "recommended", "Secret for validating GitHub webhook payloads"],
            ["FLOWDB_API_KEY", "recommended", "API key(s) for CLI authentication (comma-separated for multiple)"],
            ["FLOWDB_API_KEY_OWNER", "no", "GitHub ID label for API-key authenticated requests. Default: 'api'"],
            ["DASHBOARD_ORIGIN", "recommended", "Dashboard URL for CORS. e.g. https://flowdb.example.com"],
            ["VERCEL_API_TOKEN", "no", "Vercel API token for deployment webhook integration"],
          ].map(([k, r, v]) => (
            <tr key={k}>
              <td className="cmd">{k}</td>
              <td style={{ padding: "10px 12px", fontSize: 12, color: r === "yes" ? "var(--red)" : r === "recommended" ? "var(--yellow)" : "var(--text-muted)" }}>{r}</td>
              <td className="desc">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Dashboard</h3>
      <table className="cmd-table">
        <thead><tr><th>Variable</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          {[
            ["GITHUB_CLIENT_ID", "yes", "GitHub OAuth App client ID"],
            ["GITHUB_CLIENT_SECRET", "yes", "GitHub OAuth App client secret"],
            ["AUTH_SECRET", "yes", "Same 64-char hex secret as orchestrator"],
            ["NEXTAUTH_URL", "yes", "Full URL of the dashboard. e.g. https://flowdb.example.com"],
            ["NEXT_PUBLIC_ORCHESTRATOR_URL", "yes", "Orchestrator URL reachable from the browser"],
            ["NEXT_PUBLIC_FLOWDB_ENVIRONMENT", "no", "Label shown in the UI. e.g. production"],
            ["NEXT_PUBLIC_FLOWDB_ORG_SLUG", "no", "Org identifier. e.g. acme"],
            ["NEXT_PUBLIC_FLOWDB_PROJECT_SLUG", "no", "Project identifier. e.g. myapp"],
          ].map(([k, r, v]) => (
            <tr key={k}>
              <td className="cmd">{k}</td>
              <td style={{ padding: "10px 12px", fontSize: 12, color: r === "yes" ? "var(--red)" : "var(--text-muted)" }}>{r}</td>
              <td className="desc">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Generate AUTH_SECRET</h2>
      <pre>{`# Unix/macOS
openssl rand -hex 32

# PowerShell (Windows)
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</pre>

      <h2>GitHub OAuth App setup</h2>
      <div className="steps">
        <div className="step">
          <div className="step-content">
            <h4>Create the app</h4>
            <p>Go to <strong>GitHub → Settings → Developer settings → OAuth Apps → New OAuth App</strong></p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Set the callback URL</h4>
            <p><code>https://your-dashboard-url/api/auth/callback/github</code><br />
            For local dev: <code>http://localhost:4010/api/auth/callback/github</code></p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Copy credentials</h4>
            <p>Copy the <strong>Client ID</strong> and generate a <strong>Client Secret</strong>. Set both in the dashboard's env vars.</p>
          </div>
        </div>
      </div>

      <h2>Deploy to Railway (recommended)</h2>
      <div className="steps">
        <div className="step">
          <div className="step-content">
            <h4>Create a Railway project</h4>
            <p>Connect your GitHub repo at <a href="https://railway.app" target="_blank" rel="noopener">railway.app</a>.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Add a PostgreSQL service</h4>
            <p>Railway provides a managed Postgres. Use the connection string for both <code>DATABASE_URL</code> and <code>SOURCE_DATABASE_URL</code> (with different database names).</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Deploy the orchestrator</h4>
            <p>Root directory: <code>apps/orchestrator</code>. Start command: <code>bun run src/main.ts</code>. Set all required env vars.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Deploy the dashboard to Vercel</h4>
            <p>Root directory: <code>apps/dashboard</code>. Framework: Next.js. Set all required env vars including <code>NEXT_PUBLIC_ORCHESTRATOR_URL</code> pointing to your Railway orchestrator.</p>
          </div>
        </div>
      </div>

      <h2>Docker Compose (local)</h2>
      <pre>{`# Start everything with Docker
docker compose up --build

# Services:
# - postgres       → localhost:5432
# - orchestrator   → localhost:3001
# - dashboard      → localhost:3000`}</pre>

      <div className="callout warn">
        <span className="callout-icon">⚠️</span>
        <div className="callout-body">
          <strong>PostgreSQL TEMPLATE restriction</strong> — The source database must have
          <strong>zero open connections</strong> when a fork is created. In production, ensure
          your connection pooler (e.g. PgBouncer) can be briefly paused, or use a read replica
          as the branch source.
        </div>
      </div>

      <h2>Updating FlowDB</h2>
      <p>
        FlowDB runs database migrations automatically on startup. To update:
      </p>
      <ol>
        <li>Pull the latest code</li>
        <li>Restart the orchestrator — migrations run automatically</li>
        <li>Redeploy the dashboard</li>
      </ol>
      <p>
        No manual migration steps are needed. New <code>.sql</code> files in
        <code>apps/orchestrator/migrations/</code> are applied in alphabetical order on next boot.
      </p>
    </DocsLayout>
  );
}
