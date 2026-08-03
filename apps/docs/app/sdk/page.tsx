import { DocsLayout } from "../components/DocsLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "SDK Reference" };

export default function SdkPage() {
  return (
    <DocsLayout>
      <div className="page-header">
        <div className="page-header-eyebrow">SDK</div>
        <h1>SDK Reference</h1>
        <p>
          <code>@flowdb/sdk</code> is a typed JavaScript/TypeScript client for the FlowDB
          orchestrator API with built-in retry and timeout support.
        </p>
      </div>

      <div className="callout info">
        <span className="callout-icon">ℹ️</span>
        <div className="callout-body">
          <strong>SDK vs CLI</strong> — Use the SDK when you want to control FlowDB
          programmatically (e.g., in CI/CD scripts, test setup/teardown hooks, or preview
          environment automation). Use the CLI for day-to-day developer workflows.
        </div>
      </div>

      <h2>Installation</h2>
      <pre>{`# Inside the monorepo (workspace dependency)
bun add @flowdb/sdk

# Or import directly
import { FlowDBClient } from "@flowdb/sdk";`}</pre>

      <h2>Quick example</h2>
      <pre>{`import { FlowDBClient } from "@flowdb/sdk";

const client = new FlowDBClient({
  apiUrl: "http://localhost:3001",
  apiKey: "my-secure-api-key",
  orgSlug: "acme",
  projectSlug: "myapp",
});

// Create a branch
const { branch } = await client.createBranch({
  branchName: "ci-pr-123",
  idempotencyKey: "pr-123-run-456",
});

console.log(branch.databaseUrl);
// postgresql://…/flowdb_ci_pr_123

// Use the branch URL for your tests
// …

// Clean up
await client.deleteBranch("ci-pr-123");`}</pre>

      <h2>FlowDBClient</h2>

      <h3>Constructor</h3>
      <pre>{`new FlowDBClient(config: SDKClientConfig)`}</pre>
      <table className="cmd-table">
        <thead>
          <tr><th>Option</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          {[
            ["apiUrl", "string", "Orchestrator base URL (trailing slash is trimmed automatically)"],
            ["apiKey", "string", "API key for authentication"],
            ["orgSlug", "string", "Organization slug (sent as x-org-slug header)"],
            ["projectSlug", "string", "Project slug (sent as x-project-slug header)"],
            ["timeoutMs?", "number", "Request timeout in ms. Default: 30000"],
            ["retryOptions?", "RetryOptions", "Retry configuration (see below)"],
          ].map(([k, t, v]) => (
            <tr key={k}>
              <td className="cmd">{k}</td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--blue)", padding: "10px 12px" }}>{t}</td>
              <td className="desc">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>FlowDBClient.fromEnv()</h3>
      <p>
        Create a client from environment variables. Throws a <code>FlowDBError</code> if any
        required variable is missing.
      </p>
      <pre>{`const client = FlowDBClient.fromEnv();
// reads: FLOWDB_API_URL, FLOWDB_API_KEY, FLOWDB_ORG_SLUG, FLOWDB_PROJECT_SLUG
// optional: FLOWDB_TIMEOUT_MS`}</pre>

      <h2>Methods</h2>

      <h3>health()</h3>
      <pre>{`const health = await client.health();
// { status: "ok", version: "0.1.0", timestamp: "…" }`}</pre>

      <h3>listBranches(limit?, cursor?)</h3>
      <pre>{`const { items, page } = await client.listBranches({ limit: 50 });
// items: BranchDto[]
// page: { limit: number, total: number }`}</pre>

      <h3>getBranch(branchName)</h3>
      <pre>{`const branch = await client.getBranch("my-feature");
// BranchDto`}</pre>

      <h3>createBranch(options)</h3>
      <pre>{`const { branch, operation } = await client.createBranch({
  branchName: "my-feature",
  idempotencyKey: "unique-key-per-request",
  sourceDatabaseUrl: "postgresql://…",  // optional override
});`}</pre>

      <h3>deleteBranch(branchName)</h3>
      <pre>{`await client.deleteBranch("my-feature");`}</pre>

      <h2>BranchDto type</h2>
      <pre>{`type BranchDto = {
  id: string;
  projectId: string;
  name: string;          // e.g. "my-feature"
  databaseName: string;  // e.g. "flowdb_my_feature"
  databaseUrl: string;   // full connection string
  sourceDatabaseName: string;
  status: "creating" | "active" | "tearing_down" | "deleted" | "failed";
  createdAt: string;     // ISO 8601
  updatedAt: string;
  deletedAt: string | null;
}`}</pre>

      <h2>Error handling</h2>
      <p>
        All methods throw <code>FlowDBError</code> on failure. You can match on the
        <code>code</code> property:
      </p>
      <pre>{`import { FlowDBError } from "@flowdb/sdk";

try {
  await client.createBranch({ branchName: "…", idempotencyKey: "…" });
} catch (err) {
  if (err instanceof FlowDBError) {
    switch (err.code) {
      case "NOT_FOUND":      // 404
      case "UNAUTHORIZED":   // 401
      case "BAD_REQUEST":    // 400
      case "CONFLICT":       // 409
      case "TIMEOUT":        // request timed out
      case "NETWORK_ERROR":  // connection refused etc.
      case "UNKNOWN":
    }
  }
}`}</pre>

      <h2>Retry configuration</h2>
      <pre>{`new FlowDBClient({
  // …
  retryOptions: {
    maxRetries: 3,          // default: 3
    initialDelayMs: 500,    // default: 500ms
    maxDelayMs: 10000,      // default: 10s
    backoffFactor: 2,       // default: 2 (exponential)
  }
})`}</pre>
      <p>
        Only network errors and 5xx responses are retried. 4xx errors (bad request, not found, etc.)
        are not retried because they would fail again.
      </p>

      <h2>CI/CD example — Vitest setup</h2>
      <pre>{`// vitest.setup.ts
import { FlowDBClient } from "@flowdb/sdk";
import { randomUUID } from "node:crypto";

const client = FlowDBClient.fromEnv();
const branchName = \`ci-\${randomUUID().slice(0, 8)}\`;

let databaseUrl: string;

beforeAll(async () => {
  const { branch } = await client.createBranch({
    branchName,
    idempotencyKey: branchName,
  });
  databaseUrl = branch.databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
});

afterAll(async () => {
  await client.deleteBranch(branchName);
});`}</pre>
    </DocsLayout>
  );
}
