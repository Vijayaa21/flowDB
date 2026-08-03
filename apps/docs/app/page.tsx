import { DocsLayout } from "./components/DocsLayout";
import Link from "next/link";

export default function HomePage() {
  return (
    <DocsLayout>
      <div className="hero">
        <div className="hero-eyebrow">
          <span>⚡</span> Open Source · PostgreSQL · Git-Native
        </div>
        <h1>Database branching<br />for modern teams</h1>
        <p className="hero-sub">
          FlowDB lets you fork your PostgreSQL database in milliseconds — just like a git branch.
          Test features safely, run migrations on isolated copies, and throw them away when you're done.
        </p>
        <div className="hero-ctas">
          <Link href="/quickstart" className="btn-primary">
            Get started →
          </Link>
          <Link href="/how-it-works" className="btn-secondary">
            How it works
          </Link>
        </div>
      </div>

      <div className="cards">
        <Link href="/how-it-works" className="card">
          <div className="card-icon">🔀</div>
          <div className="card-title">How It Works</div>
          <div className="card-desc">Understand the PostgreSQL TEMPLATE trick that makes instant forking possible.</div>
        </Link>
        <Link href="/quickstart" className="card">
          <div className="card-icon">🚀</div>
          <div className="card-title">Quick Start</div>
          <div className="card-desc">Run FlowDB locally in under 5 minutes — orchestrator, dashboard, and CLI.</div>
        </Link>
        <Link href="/cli/reference" className="card">
          <div className="card-icon">⌨️</div>
          <div className="card-title">CLI Reference</div>
          <div className="card-desc">Every <code>flowdb</code> command with flags and real examples.</div>
        </Link>
        <Link href="/sdk" className="card">
          <div className="card-icon">📦</div>
          <div className="card-title">SDK</div>
          <div className="card-desc">Typed JavaScript/TypeScript client for the FlowDB orchestrator API.</div>
        </Link>
        <Link href="/architecture" className="card">
          <div className="card-icon">🏗️</div>
          <div className="card-title">Architecture</div>
          <div className="card-desc">Monorepo layout, package responsibilities, and data flow.</div>
        </Link>
        <Link href="/self-hosting" className="card">
          <div className="card-icon">🖥️</div>
          <div className="card-title">Self-Hosting</div>
          <div className="card-desc">Deploy the orchestrator and dashboard on your own infrastructure.</div>
        </Link>
      </div>

      <h2>What is FlowDB?</h2>
      <p>
        FlowDB is an open-source platform for <strong>database branching</strong> — the same idea as
        git branches, but applied to your PostgreSQL database.
      </p>
      <p>
        Every time you want to test a migration, try a new feature, or spin up a preview environment,
        FlowDB creates a <strong>full copy of your database in milliseconds</strong>. When you're done,
        you delete it. Your main database is never touched.
      </p>

      <h2>Why does it exist?</h2>
      <p>
        The standard way teams handle database changes is fragile: shared staging databases, manual
        dumps and restores, or just "test it in production." All of these have real costs — broken
        staging environments, lost test data, slow feedback loops.
      </p>
      <p>
        FlowDB makes database branching as natural as <code>git checkout -b my-feature</code>. You get:
      </p>
      <ul>
        <li><strong>Isolated per-feature databases</strong> — no more broken staging</li>
        <li><strong>Instant forks</strong> — milliseconds, not minutes (PostgreSQL TEMPLATE)</li>
        <li><strong>Clean teardown</strong> — branches are ephemeral by design</li>
        <li><strong>Team workflows</strong> — GitHub OAuth, dashboard, CLI, and SDK</li>
        <li><strong>Migration safety</strong> — run migrations on a branch before touching main</li>
      </ul>

      <h2>The one-line pitch</h2>
      <blockquote>
        FlowDB is GitHub-authenticated database branching for teams that want preview-safe PostgreSQL workflows.
      </blockquote>

      <h2>Project structure</h2>
      <p>FlowDB is a monorepo with several packages working together:</p>
      <div className="cards">
        {[
          { name: "packages/core", icon: "⚙️", desc: "PostgreSQL TEMPLATE fork engine — the heart of branching" },
          { name: "packages/cli", icon: "⌨️", desc: "flowdb CLI — login, branch, migrate, seed, diff, status" },
          { name: "packages/sdk", icon: "📦", desc: "Typed HTTP client with retry/timeout for the orchestrator API" },
          { name: "packages/reconciler", icon: "🔍", desc: "Migration scanner + schema conflict detection" },
          { name: "apps/orchestrator", icon: "🛠️", desc: "Hono/Bun REST API — branch lifecycle, auth, webhooks" },
          { name: "apps/dashboard", icon: "🖥️", desc: "Next.js web UI — GitHub OAuth, branch management" },
        ].map((pkg) => (
          <div className="card" key={pkg.name}>
            <div className="card-icon">{pkg.icon}</div>
            <div className="card-title" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{pkg.name}</div>
            <div className="card-desc">{pkg.desc}</div>
          </div>
        ))}
      </div>
    </DocsLayout>
  );
}
