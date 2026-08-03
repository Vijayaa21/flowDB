import { DocsLayout } from "../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quick Start" };

export default function QuickStartPage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">Getting Started</div>
        <h1>Quick Start</h1>
        <p>
          Get FlowDB running locally in under 5 minutes — orchestrator, dashboard, and CLI all talking to each other.
        </p>
      </div>

      <h2>Prerequisites</h2>
      <ul>
        <li><strong>Bun 1.2+</strong> — <a href="https://bun.sh" target="_blank" rel="noopener">bun.sh</a></li>
        <li><strong>PostgreSQL 14+</strong> — running locally or via Docker</li>
        <li><strong>GitHub OAuth App</strong> — for dashboard sign-in (<a href="https://github.com/settings/applications/new" target="_blank" rel="noopener">create one</a>)</li>
      </ul>

      <div className="callout tip">
        <span className="callout-icon">💡</span>
        <div className="callout-body">
          <strong>Just want the CLI?</strong> Skip to the <a href="#cli-only">CLI-only setup</a> — you don't need
          the dashboard or GitHub OAuth to use the core branching features.
        </div>
      </div>

      <h2>1 · Clone and install</h2>
      <pre>{`git clone https://github.com/Vijayaa21/flowDB.git
cd flowDB
bun install`}</pre>

      <h2>2 · Configure the orchestrator</h2>
      <p>
        Copy the example and fill in your PostgreSQL connection strings:
      </p>
      <pre>{`cp apps/orchestrator/.env.example apps/orchestrator/.env`}</pre>

      <p>Edit <code>apps/orchestrator/.env</code>:</p>
      <pre>{`# Port the orchestrator listens on
PORT=3001

# Meta-database where FlowDB stores branch records
DATABASE_URL=postgresql://postgres:password@localhost:5433/flowdb_meta

# The database you want to branch FROM
SOURCE_DATABASE_URL=postgresql://postgres:password@localhost:5433/myproject

# NextAuth secret — MUST match the dashboard's AUTH_SECRET
AUTH_SECRET=generate-a-random-64-char-hex-string

# CLI / server-to-server API key (can be any strong random string)
FLOWDB_API_KEY=my-secure-api-key
FLOWDB_API_KEY_OWNER=local

# Allow the dashboard to call the orchestrator
DASHBOARD_ORIGIN=http://localhost:4010`}</pre>

      <div className="callout warn">
        <span className="callout-icon">⚠️</span>
        <div className="callout-body">
          <strong>Two separate databases</strong> — FlowDB needs two PostgreSQL databases:
          one to store its own metadata (<code>flowdb_meta</code>) and one that will be the source
          for branches (<code>myproject</code>). Both must already exist before you start.
        </div>
      </div>

      <h2>3 · Configure the dashboard</h2>
      <pre>{`cp apps/dashboard/.env.local.example apps/dashboard/.env.local`}</pre>
      <p>Edit <code>apps/dashboard/.env.local</code>:</p>
      <pre>{`# GitHub OAuth (from https://github.com/settings/applications/new)
# Callback URL: http://localhost:4010/api/auth/callback/github
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# MUST match orchestrator AUTH_SECRET exactly
AUTH_SECRET=same-secret-as-orchestrator

NEXTAUTH_URL=http://localhost:4010
NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:3001

# Your org/project identifiers (can be anything locally)
NEXT_PUBLIC_FLOWDB_ENVIRONMENT=local
NEXT_PUBLIC_FLOWDB_ORG_SLUG=local
NEXT_PUBLIC_FLOWDB_PROJECT_SLUG=myproject`}</pre>

      <h2>4 · Start both services</h2>
      <p>Open two terminal windows:</p>
      <pre>{`# Terminal 1 — orchestrator
bun run dev:orchestrator
# → FlowDB Orchestrator running on http://localhost:3001

# Terminal 2 — dashboard
bun run dev:dashboard
# → Dashboard running on http://localhost:4010`}</pre>

      <h2>5 · Set up the CLI</h2>
      <pre>{`# Add flowdb to your PowerShell profile (Windows)
# — or use: bun packages/cli/src/index.ts <command>

flowdb login \
  --url http://localhost:3001 \
  --api-key my-secure-api-key \
  --org local \
  --project myproject`}</pre>

      <h2>6 · Create your first branch</h2>
      <pre>{`# Check everything is wired up
flowdb status

# Create a branch
flowdb branch create my-first-branch

# Get the DATABASE_URL
flowdb branch connect my-first-branch

# Or write it directly to .env.local in your project
flowdb branch connect my-first-branch --write

# See all branches
flowdb branch list`}</pre>

      <p>
        You should see something like:
      </p>
      <pre>{`✓ Branch created: my-first-branch
DATABASE_URL: postgresql://postgres:password@localhost:5433/flowdb_my_first_branch`}</pre>

      <h2>7 · Open the dashboard</h2>
      <p>
        Go to <a href="http://localhost:4010" target="_blank" rel="noopener">http://localhost:4010</a>,
        sign in with GitHub, and you'll see your branches in the UI.
      </p>

      <h2 id="cli-only">CLI-only setup (no dashboard)</h2>
      <p>
        If you only want branch management without the web UI:
      </p>
      <div className="steps">
        <div className="step">
          <div className="step-content">
            <h4>Start the orchestrator</h4>
            <p>Only <code>DATABASE_URL</code>, <code>SOURCE_DATABASE_URL</code>, and <code>FLOWDB_API_KEY</code> are required. Skip <code>AUTH_SECRET</code> and GitHub vars.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Login with the CLI</h4>
            <p><code>flowdb login --url http://localhost:3001 --api-key &lt;key&gt; --org local --project myproject</code></p>
          </div>
        </div>
        <div className="step">
          <div className="step-content">
            <h4>Branch away</h4>
            <p><code>flowdb branch create my-feature</code> — that's it.</p>
          </div>
        </div>
      </div>

      <h2>Verify the setup</h2>
      <p>Run through this checklist to confirm everything works:</p>
      <ul>
        <li>✅ <code>flowdb health</code> prints <code>Status: ok</code></li>
        <li>✅ <code>flowdb whoami</code> shows your credentials</li>
        <li>✅ <code>flowdb branch create test</code> succeeds</li>
        <li>✅ <code>flowdb branch list</code> shows the new branch</li>
        <li>✅ Dashboard at <code>localhost:4010</code> loads and shows the branch</li>
        <li>✅ <code>flowdb branch delete test</code> removes it (type <code>y</code> to confirm)</li>
      </ul>
    </DocsLayout>
  );
}
