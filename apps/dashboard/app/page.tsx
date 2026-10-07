"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  api,
  readDashboardConfig,
  saveDashboardConfig,
  type Branch,
  type DashboardConfig,
} from "../lib/api";
import { beginGithubSignIn, beginGithubSignOut } from "../lib/auth-flow";
import { queryKeys } from "../lib/query-keys";

type SectionKey = "branches" | "settings" | "setup" | "guide";
type ThemeMode = "light" | "dark" | "system";
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._\/\-]+$/;

type SetupStep = {
  key: string;
  label: string;
  description: string;
  isDone: boolean;
};

function statusUpper(status: string | undefined): string {
  return (status ?? "UNKNOWN").toUpperCase();
}

function timeAgo(value?: string): string {
  if (!value) {
    return "just now";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "just now";
  }
  const delta = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (delta < 60) {
    return `${delta}s ago`;
  }
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4">
      <div className="h-4 w-24 rounded bg-(--gh-border-default)" />
      <div className="mt-3 h-9 w-28 animate-pulse rounded bg-(--gh-canvas-subtle)" />
    </div>
  );
}

function BranchFeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="h-20 animate-pulse rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-subtle)"
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = statusUpper(status);
  const cls =
    normalized === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
      : normalized === "MIGRATING"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
        : normalized === "CONFLICT"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          : "bg-(--gh-canvas-subtle) text-(--gh-fg-muted)";

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{normalized}</span>;
}

function BranchCreateForm({
  requiresAuth,
  creating,
  branchName,
  sourceDatabaseUrl,
  onBranchNameChange,
  onSourceDatabaseUrlChange,
  onSignIn,
  onSubmit,
}: {
  requiresAuth: boolean;
  creating: boolean;
  branchName: string;
  sourceDatabaseUrl: string;
  onBranchNameChange: (value: string) => void;
  onSourceDatabaseUrlChange: (value: string) => void;
  onSignIn: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-medium text-(--gh-fg-default)">Create Branch</h2>
          <p className="mt-1 text-sm text-(--gh-fg-muted)">
            Fork your source database into a new isolated branch.
          </p>
        </div>
        {requiresAuth ? (
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-lg bg-(--gh-accent-emphasis) px-3 py-2 text-sm text-white hover:brightness-110"
          >
            Sign in with GitHub
          </button>
        ) : null}
      </div>

      <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-sm text-(--gh-fg-muted)">
          Branch Name
          <input
            type="text"
            value={branchName}
            onChange={(event) => onBranchNameChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="feature/checkouts"
            disabled={requiresAuth || creating}
          />
        </label>
        <label className="text-sm text-(--gh-fg-muted)">
          Source Database URL
          <input
            type="url"
            value={sourceDatabaseUrl}
            onChange={(event) => onSourceDatabaseUrlChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="postgresql://user:pass@host:5432/db"
            disabled={requiresAuth || creating}
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={requiresAuth || creating}
            className="rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-sm text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Branch"}
          </button>
        </div>
      </form>

      <p className="mt-3 text-xs text-(--gh-fg-muted)">
        The dashboard sends this request to the orchestrator at{" "}
        <span className="font-medium">POST /branches/fork</span>.
      </p>
    </section>
  );
}

function BranchHealthFeed({
  data,
  isLoading,
  isError,
  requiresAuth,
  deletingBranch,
  onRetry,
  onSignIn,
  onTeardown,
}: {
  data: Branch[];
  isLoading: boolean;
  isError: boolean;
  requiresAuth: boolean;
  deletingBranch: string | null;
  onRetry: () => void;
  onSignIn: () => void;
  onTeardown: (name: string) => Promise<void>;
}) {
  if (requiresAuth) {
    return (
      <div className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4 text-sm text-(--gh-fg-muted)">
        <div className="flex items-center justify-between gap-3">
          <span>Sign in with GitHub to load branch health feed.</span>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-md bg-(--gh-accent-emphasis) px-2 py-1 text-xs text-white hover:brightness-110"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <BranchFeedSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <div className="flex items-center justify-between gap-3">
          <span>Failed to load branch health feed.</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--gh-border-default) bg-(--gh-canvas-default) p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-(--gh-canvas-subtle) text-lg">
          🌱
        </div>
        <p className="mt-3 text-sm font-semibold text-(--gh-fg-default)">No active branches yet</p>
        <p className="mt-1 text-xs text-(--gh-fg-muted)">
          Fork your source database using the form above or use the FlowDB CLI from your terminal:
        </p>
        <div className="mt-3 inline-block rounded-lg bg-(--gh-canvas-subtle) px-3 py-1.5 font-mono text-xs text-(--gh-fg-default)">
          flowdb branch create feature/my-new-feature
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((branch) => (
        <article
          key={`${branch.branchName}-${branch.updatedAt ?? "na"}`}
          className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 text-sm font-medium text-(--gh-fg-default)">{branch.branchName}</p>
            <StatusBadge status={branch.status} />
          </div>
          <p className="mt-2 text-xs text-(--gh-fg-muted)">Updated {timeAgo(branch.updatedAt)}</p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void onTeardown(branch.branchName)}
              disabled={deletingBranch === branch.branchName}
              className="rounded-md border border-(--gh-border-default) px-2 py-1 text-xs text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingBranch === branch.branchName ? "Closing..." : "Close Branch"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function SetupWizard({
  steps,
  draftConfig,
  isSignedIn,
  onSignIn,
  onConfigChange,
  onSave,
}: {
  steps: SetupStep[];
  draftConfig: DashboardConfig;
  isSignedIn: boolean;
  onSignIn: () => void;
  onConfigChange: (patch: Partial<DashboardConfig>) => void;
  onSave: () => Promise<void>;
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("");

  const completed = steps.filter((step) => step.isDone).length;
  const progressPercent = Math.round((completed / steps.length) * 100);

  const wizardTabs = [
    { id: 0, title: "1. Authentication", desc: "Connect GitHub" },
    { id: 1, title: "2. Orchestrator", desc: "API Endpoint" },
    { id: 2, title: "3. Project Scope", desc: "Org & Project" },
    { id: 3, title: "4. Source Database", desc: "Postgres Connection" },
  ];

  const handleTestOrchestrator = async () => {
    setTestingConnection(true);
    setConnectionStatus("idle");
    setConnectionMessage("");
    try {
      const url = draftConfig.orchestratorUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${url}/health`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { status?: string; version?: string };
        setConnectionStatus("success");
        setConnectionMessage(`Connected successfully! Version: ${data.version ?? "unknown"}`);
      } else {
        setConnectionStatus("error");
        setConnectionMessage(`Orchestrator returned HTTP ${res.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionMessage(
        err instanceof Error
          ? `Connection failed: ${err.message}`
          : "Could not reach orchestrator. Is it running?"
      );
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <section className="rounded-2xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-(--gh-border-default) pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-(--gh-border-default) bg-(--gh-canvas-subtle) px-3 py-1 text-xs font-semibold uppercase tracking-wider text-(--gh-fg-muted)">
            <span>🚀</span> First-Run Onboarding
          </div>
          <h2 className="mt-2 text-lg font-semibold text-(--gh-fg-default)">
            Configure Your FlowDB Workspace
          </h2>
          <p className="mt-1 text-sm text-(--gh-fg-muted)">
            Follow this 4-step wizard to connect your orchestrator and source database.
          </p>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-(--gh-fg-default)">
            {completed}/{steps.length} completed ({progressPercent}%)
          </span>
          <div className="mt-2 h-2 w-36 overflow-hidden rounded-full bg-(--gh-canvas-subtle)">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step Tabs */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {wizardTabs.map((tab) => {
          const isTabActive = currentStepIndex === tab.id;
          const isTabDone = steps[tab.id]?.isDone ?? false;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCurrentStepIndex(tab.id)}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                isTabActive
                  ? "border-(--gh-accent-emphasis) bg-(--gh-accent-emphasis)/10"
                  : "border-(--gh-border-default) bg-(--gh-canvas-subtle) hover:border-(--gh-border-muted)"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={`text-xs font-medium ${
                    isTabActive ? "text-(--gh-accent-emphasis)" : "text-(--gh-fg-muted)"
                  }`}
                >
                  {tab.title}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    isTabDone ? "bg-emerald-500" : isTabActive ? "bg-(--gh-accent-emphasis)" : "bg-amber-400"
                  }`}
                />
              </div>
              <span className="mt-1 text-xs font-semibold text-(--gh-fg-default)">
                {tab.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="mt-6 rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-5">
        {currentStepIndex === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-(--gh-fg-default)">
                Step 1: Sign in with GitHub
              </h3>
              <p className="mt-1 text-xs text-(--gh-fg-muted)">
                FlowDB uses GitHub OAuth as its identity provider. All database branches are scoped to your authenticated identity.
              </p>
            </div>
            {isSignedIn ? (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                <span className="text-base">✅</span>
                <span>You are signed in with GitHub. Your identity is active.</span>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">Authentication required</p>
                <p className="mt-1 text-xs">
                  Click the button below to sign in with GitHub via NextAuth.
                </p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-xs font-medium text-white hover:brightness-110"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Sign in with GitHub
                </button>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(1)}
                className="rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-xs font-medium text-white hover:brightness-110"
              >
                Next: Orchestrator URL →
              </button>
            </div>
          </div>
        )}

        {currentStepIndex === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-(--gh-fg-default)">
                Step 2: Configure Orchestrator Endpoint
              </h3>
              <p className="mt-1 text-xs text-(--gh-fg-muted)">
                The orchestrator is the backend REST service (Hono/Bun) that communicates with PostgreSQL to fork databases.
              </p>
            </div>
            <label className="block text-xs font-medium text-(--gh-fg-muted)">
              Orchestrator URL
              <input
                type="text"
                value={draftConfig.orchestratorUrl}
                onChange={(e) => onConfigChange({ orchestratorUrl: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-2 font-mono text-xs text-(--gh-fg-default)"
                placeholder="http://localhost:3001"
              />
              <span className="mt-1 block text-[11px] text-(--gh-fg-muted)">
                Default local dev port: <code className="font-mono">http://localhost:3001</code>
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleTestOrchestrator()}
                disabled={testingConnection || !draftConfig.orchestratorUrl.trim()}
                className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-1.5 text-xs font-medium text-(--gh-fg-default) hover:bg-(--gh-canvas-subtle) disabled:opacity-60"
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>
              {connectionStatus === "success" && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✅ {connectionMessage}
                </span>
              )}
              {connectionStatus === "error" && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  ❌ {connectionMessage}
                </span>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(0)}
                className="rounded-lg border border-(--gh-border-default) px-3 py-1.5 text-xs text-(--gh-fg-muted) hover:text-(--gh-fg-default)"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStepIndex(2)}
                className="rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-xs font-medium text-white hover:brightness-110"
              >
                Next: Project Scope →
              </button>
            </div>
          </div>
        )}

        {currentStepIndex === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-(--gh-fg-default)">
                Step 3: Define Scope & Environment
              </h3>
              <p className="mt-1 text-xs text-(--gh-fg-muted)">
                Set the organization slug, project identifier, and deployment environment for tracking and tagging branches.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-(--gh-fg-muted)">
                Environment
                <input
                  type="text"
                  value={draftConfig.environment}
                  onChange={(e) => onConfigChange({ environment: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-2 text-xs text-(--gh-fg-default)"
                  placeholder="local"
                />
              </label>
              <label className="text-xs font-medium text-(--gh-fg-muted)">
                Organization Slug
                <input
                  type="text"
                  value={draftConfig.orgSlug}
                  onChange={(e) => onConfigChange({ orgSlug: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-2 text-xs text-(--gh-fg-default)"
                  placeholder="acme"
                />
              </label>
              <label className="text-xs font-medium text-(--gh-fg-muted)">
                Project Slug
                <input
                  type="text"
                  value={draftConfig.projectSlug}
                  onChange={(e) => onConfigChange({ projectSlug: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-2 text-xs text-(--gh-fg-default)"
                  placeholder="flowdb"
                />
              </label>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(1)}
                className="rounded-lg border border-(--gh-border-default) px-3 py-1.5 text-xs text-(--gh-fg-muted) hover:text-(--gh-fg-default)"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStepIndex(3)}
                className="rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-xs font-medium text-white hover:brightness-110"
              >
                Next: Source Database →
              </button>
            </div>
          </div>
        )}

        {currentStepIndex === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-(--gh-fg-default)">
                Step 4: Source Database Connection
              </h3>
              <p className="mt-1 text-xs text-(--gh-fg-muted)">
                This is the primary PostgreSQL database that FlowDB forks using the <code>CREATE DATABASE … TEMPLATE</code> clause.
              </p>
            </div>
            <label className="block text-xs font-medium text-(--gh-fg-muted)">
              Source Database URL
              <input
                type="url"
                value={draftConfig.sourceDatabaseUrl}
                onChange={(e) => onConfigChange({ sourceDatabaseUrl: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-(--gh-border-default) bg-(--gh-canvas-default) px-3 py-2 font-mono text-xs text-(--gh-fg-default)"
                placeholder="postgresql://user:pass@localhost:5432/myproject"
              />
              <span className="mt-1 block text-[11px] text-(--gh-fg-muted)">
                Must be an accessible PostgreSQL instance with permissions to CREATE DATABASE.
              </span>
            </label>

            <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-default) p-3 text-xs text-(--gh-fg-muted)">
              <p className="font-semibold text-(--gh-fg-default)">Ready to complete setup?</p>
              <p className="mt-0.5">
                Saving will store your preferences in localStorage and take you straight to your branch dashboard.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(2)}
                className="rounded-lg border border-(--gh-border-default) px-3 py-1.5 text-xs text-(--gh-fg-muted) hover:text-(--gh-fg-default)"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  void onSave();
                }}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Finish Setup & Open Branches ✨
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GithubAppGuide() {
  return (
    <section className="mt-6 rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-5">
      <h2 className="m-0 text-base font-medium text-(--gh-fg-default)">
        GitHub App Integration Guide
      </h2>
      <p className="mt-2 text-sm text-(--gh-fg-muted)">
        Connect FlowDB to your repository so pull requests can create and teardown database branches
        automatically.
      </p>

      <div className="mt-4 space-y-3 text-sm text-(--gh-fg-muted)">
        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">
            1. Register the GitHub App from manifest
          </p>
          <p className="mt-1">
            Open the org app creation page and paste the manifest from
            integrations/github-app/app.yml.
          </p>
          <p className="mt-1 font-mono text-xs">
            https://github.com/organizations/&lt;org&gt;/settings/apps/new?state=flowdb
          </p>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">2. Capture generated credentials</p>
          <p className="mt-1">
            Save App ID, Client ID, Client Secret, Webhook Secret, and Private Key securely.
          </p>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">
            3. Configure orchestrator environment
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs">
            <li>GITHUB_WEBHOOK_SECRET</li>
            <li>GITHUB_TOKEN (installation token)</li>
            <li>DATABASE_URL</li>
          </ul>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">4. Install and validate</p>
          <p className="mt-1">
            Install the app on your repo, then confirm webhook deliveries reach /webhooks/github.
          </p>
          <p className="mt-1">
            Open a PR to trigger branch creation and close it to trigger teardown.
          </p>
        </div>
      </div>
    </section>
  );
}

function LoadingScreen() {
  return (
    <main
      className="min-h-screen px-4 py-6 text-(--gh-fg-default) sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "radial-gradient(circle_at_top_left,rgba(9,105,218,0.14),transparent_32%),linear-gradient(180deg,#f6f8fa_0%,#eef2f7_100%)",
      }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-center justify-center rounded-3xl border border-(--gh-border-default) bg-white/80 p-8 text-center shadow-[0_20px_80px_rgba(36,41,47,0.08)] backdrop-blur dark:bg-(--gh-canvas-default)/90">
        <div>
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-(--gh-accent-emphasis)/15" />
          <p className="mt-4 text-sm text-(--gh-fg-muted)">Loading your FlowDB workspace</p>
        </div>
      </div>
    </main>
  );
}

function PublicLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main
      className="min-h-screen px-4 py-6 text-(--gh-fg-default) sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "radial-gradient(circle_at_top_left,rgba(9,105,218,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(46,129,247,0.12),transparent_24%),linear-gradient(180deg,#f6f8fa_0%,#eef2f7_100%)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-(--gh-border-default) bg-white/80 px-5 py-4 shadow-[0_20px_80px_rgba(36,41,47,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--gh-fg-muted)">
              FlowDB
            </p>
            <h1 className="mt-1 text-lg font-semibold text-(--gh-fg-default)">
              Database branching made understandable for new users
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSignIn}
              className="rounded-xl bg-(--gh-accent-emphasis) px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              Continue with GitHub
            </button>
            <a
              href="/signup"
              className="rounded-xl border border-(--gh-border-default) bg-white px-4 py-2 text-sm font-medium text-(--gh-fg-default) hover:bg-(--gh-canvas-subtle)"
            >
              See signup flow
            </a>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-(--gh-border-default) bg-white/85 p-6 shadow-[0_20px_80px_rgba(36,41,47,0.08)] backdrop-blur sm:p-8">
            <span className="inline-flex rounded-full border border-(--gh-border-default) px-3 py-1 text-xs font-medium text-(--gh-fg-muted)">
              New user path
            </span>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-(--gh-fg-default) sm:text-5xl">
              Sign in, configure one source database, and create your first branch.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-(--gh-fg-muted) sm:text-lg">
              FlowDB is designed around a simple first-run story: authenticate with GitHub, point
              the dashboard at the orchestrator, and fork a PostgreSQL database into an isolated
              branch for preview work.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-xl bg-(--gh-accent-emphasis) px-5 py-3 text-sm font-medium text-white hover:brightness-110"
              >
                Start with GitHub
              </button>
              <a
                href="#how-it-works"
                className="rounded-xl border border-(--gh-border-default) bg-white px-5 py-3 text-sm font-medium text-(--gh-fg-default) hover:bg-(--gh-canvas-subtle)"
              >
                See how it works
              </a>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "1. Sign in",
                  text: "Use GitHub OAuth to create a FlowDB session.",
                },
                {
                  title: "2. Configure",
                  text: "Set the orchestrator URL and source database details.",
                },
                {
                  title: "3. Branch",
                  text: "Create isolated PostgreSQL branches for preview work.",
                },
              ].map((step) => (
                <article
                  key={step.title}
                  className="rounded-2xl border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-4"
                >
                  <p className="text-sm font-semibold text-(--gh-fg-default)">{step.title}</p>
                  <p className="mt-2 text-sm leading-6 text-(--gh-fg-muted)">{step.text}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-3xl border border-(--gh-border-default) bg-white/85 p-6 shadow-[0_20px_80px_rgba(36,41,47,0.08)] backdrop-blur">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--gh-fg-muted)">
                What FlowDB does
              </h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-(--gh-fg-muted)">
                <p>Creates temporary database branches that behave like isolated preview copies.</p>
                <p>Routes user actions through a dashboard and a protected orchestrator API.</p>
                <p>Uses GitHub as the identity provider, so there is no password setup overhead.</p>
              </div>
            </section>

            <section className="rounded-3xl border border-(--gh-border-default) bg-white/85 p-6 shadow-[0_20px_80px_rgba(36,41,47,0.08)] backdrop-blur" id="how-it-works">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--gh-fg-muted)">
                What you need to run it
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-(--gh-fg-muted)">
                <li>Bun and Docker for local development.</li>
                <li>A GitHub OAuth App for real login and signup.</li>
                <li>A PostgreSQL source database for branch creation.</li>
                <li>An orchestrator URL and auth secret for the dashboard.</li>
              </ul>
              <a
                href="/docs/GETTING_STARTED.md"
                className="mt-5 inline-flex rounded-xl border border-(--gh-border-default) px-4 py-2 text-sm font-medium text-(--gh-fg-default) hover:bg-(--gh-canvas-subtle)"
              >
                Read the run guide
              </a>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkspaceOrientation({
  steps,
  isSignedIn,
  onSignIn,
  onOpenSetup,
  onOpenBranches,
}: {
  steps: SetupStep[];
  isSignedIn: boolean;
  onSignIn: () => void;
  onOpenSetup: () => void;
  onOpenBranches: () => void;
}) {
  const nextStep = steps.find((step) => !step.isDone);

  return (
    <section
      className="mb-6 rounded-3xl border border-(--gh-border-default) p-5 text-white shadow-[0_20px_80px_rgba(15,23,42,0.28)] sm:p-6"
      style={{ backgroundImage: "linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)" }}
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            New user orientation
          </p>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
            Follow one clear path from setup to your first branch.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
            FlowDB is easier to understand when the product shows a single next step instead of
            every tool at once. Start with GitHub sign in, finish the setup wizard, then create
            your first branch.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {!isSignedIn ? (
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Sign in with GitHub
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenSetup}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Open setup wizard
            </button>
            <button
              type="button"
              onClick={onOpenBranches}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Open branches
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {steps.map((step) => (
            <article
              key={step.key}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-1 text-sm leading-6 text-white/70">{step.description}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    step.isDone ? "bg-emerald-400/20 text-emerald-100" : "bg-white/10 text-white/70"
                  }`}
                >
                  {step.isDone ? "Done" : "Next"}
                </span>
              </div>
            </article>
          ))}
          {nextStep ? (
            <p className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/80">
              Next up: {nextStep.label}. {isSignedIn ? "Open the setup wizard to finish it." : "Sign in to continue."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const hasFlowDbToken = Boolean(session?.token);
  const isSignedIn = Boolean(session?.user);
  const [config, setConfig] = useState<DashboardConfig>(() => readDashboardConfig());
  const [draftConfig, setDraftConfig] = useState<DashboardConfig>(() => readDashboardConfig());
  const [activeSection, setActiveSection] = useState<SectionKey>("setup");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [now, setNow] = useState(Date.now());
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newSourceDatabaseUrl, setNewSourceDatabaseUrl] = useState("");
  const [createdBranch, setCreatedBranch] = useState<{
    name: string;
    url: string;
  } | null>(null);

  const branchesQuery = useQuery({
    queryKey: queryKeys.branches(config),
    queryFn: () => api.branches.list(config),
    enabled: hasFlowDbToken,
    refetchInterval: 30000,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.health(config),
    queryFn: () => api.health.check(config),
    refetchInterval: 60000,
  });

  const userProfileQuery = useQuery({
    queryKey: queryKeys.userMe(config),
    queryFn: () => api.users.me(config),
    enabled: hasFlowDbToken,
    retry: 1,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const stored = readDashboardConfig();
    setConfig(stored);
    setDraftConfig(stored);
    setNewSourceDatabaseUrl(stored.sourceDatabaseUrl);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("flowdb-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mode: ThemeMode =
      savedTheme === "light" || savedTheme === "dark" || savedTheme === "system"
        ? savedTheme
        : "system";
    const shouldUseDark = mode === "system" ? prefersDark : mode === "dark";
    setThemeMode(mode);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  // Sync the signed-in GitHub user to the orchestrator's persistent users table.
  // Runs once when the session becomes authenticated. Failures are swallowed silently
  // so that a misconfigured orchestrator URL never blocks the dashboard from loading.
  useEffect(() => {
    if (!hasFlowDbToken || !session?.user) {
      return;
    }
    const currentConfig = readDashboardConfig();
    api.users
      .sync(
        {
          githubLogin: session.user.githubLogin,
          githubEmail: session.user.email ?? null,
          displayName: session.user.displayName ?? session.user.name ?? null,
          avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
        },
        currentConfig
      )
      .then(() => {
        void userProfileQuery.refetch();
      })
      .catch(() => {
        // Non-fatal — orchestrator may not be reachable yet
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFlowDbToken]);


  const branches = branchesQuery.data ?? [];
  const hasRequiredConfig =
    config.orchestratorUrl.length > 0 &&
    config.orgSlug.length > 0 &&
    config.projectSlug.length > 0 &&
    config.sourceDatabaseUrl.length > 0;
  const setupSteps: SetupStep[] = [
    {
      key: "signin",
      label: "Sign in with GitHub",
      description: "Authenticate so dashboard can call protected orchestrator endpoints.",
      isDone: isSignedIn,
    },
    {
      key: "orchestrator",
      label: "Configure Orchestrator URL",
      description: "Point dashboard to your running orchestrator service.",
      isDone: Boolean(config.orchestratorUrl.trim()),
    },
    {
      key: "scope",
      label: "Set Organization and Project",
      description: "Define the branch ownership scope for requests.",
      isDone: Boolean(config.orgSlug.trim()) && Boolean(config.projectSlug.trim()),
    },
    {
      key: "source",
      label: "Set Source Database URL",
      description: "Provide the source database used for branch forking.",
      isDone: Boolean(config.sourceDatabaseUrl.trim()),
    },
  ];
  const setupCompletedCount = setupSteps.filter((step) => step.isDone).length;
  const firstIncompleteStep = setupSteps.find((step) => !step.isDone) ?? null;
  const stats = useMemo(() => {
    const totalBranches = branches.length;
    const activeMigrations = branches.filter(
      (branch) => statusUpper(branch.status) === "MIGRATING"
    ).length;
    const conflictAlerts = branches.filter(
      (branch) => statusUpper(branch.status) === "CONFLICT"
    ).length;
    return [
      { label: "Total Branches", value: String(totalBranches) },
      { label: "Active Migrations", value: String(activeMigrations) },
      { label: "Conflict Alerts", value: String(conflictAlerts) },
    ];
  }, [branches]);

  const lastUpdatedSeconds =
    branchesQuery.dataUpdatedAt > 0
      ? Math.max(0, Math.floor((now - branchesQuery.dataUpdatedAt) / 1000))
      : 0;

  const isConnected = healthQuery.isSuccess && healthQuery.data.status === "ok";

  const userProfile = userProfileQuery.data;
  const githubLogin = userProfile?.githubLogin || session?.user?.githubLogin || "";
  const userName = userProfile?.displayName || session?.user?.name || (githubLogin ? `@${githubLogin}` : "GitHub User");
  const userAvatar = userProfile?.avatarUrl || session?.user?.image || "";
  const githubId = userProfile?.githubId || session?.user?.githubId || "";
  const initials = (userProfile?.displayName || session?.user?.name || githubLogin || "GH")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const setTheme = (mode: ThemeMode) => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextDark = mode === "system" ? prefersDark : mode === "dark";
    setThemeMode(mode);
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("flowdb-theme", mode);
  };

  const handleSaveSettings = async (): Promise<boolean> => {
    const orchestratorValue = draftConfig.orchestratorUrl.trim();
    if (!orchestratorValue) {
      toast.error("Orchestrator URL is required.");
      return false;
    }

    const nextConfig = saveDashboardConfig({
      ...draftConfig,
      orchestratorUrl: orchestratorValue,
    });

    setConfig(nextConfig);
    setDraftConfig(nextConfig);
    setNewSourceDatabaseUrl(nextConfig.sourceDatabaseUrl);
    toast.success("Dashboard settings saved.");
    await Promise.all([branchesQuery.refetch(), healthQuery.refetch()]);
    return true;
  };

  const handleWizardSaveAndContinue = async () => {
    const saved = await handleSaveSettings();
    if (!saved) {
      return;
    }
    setActiveSection("branches");
  };

  const handleTeardown = async (name: string) => {
    setDeletingBranch(name);
    try {
      await api.branches.teardown(name, config);
      toast.success(`Branch ${name} closed.`);
      await branchesQuery.refetch();
    } catch {
      toast.error(`Failed to close branch ${name}.`);
    } finally {
      setDeletingBranch(null);
    }
  };

  const handleCreateBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasFlowDbToken) {
      toast.error("Sign in with GitHub before creating a branch.");
      return;
    }

    const branchName = newBranchName.trim();
    const sourceDatabaseUrl = newSourceDatabaseUrl.trim();

    if (!branchName) {
      toast.error("Branch name is required.");
      return;
    }

    if (!BRANCH_NAME_REGEX.test(branchName) || branchName.length > 63) {
      toast.error("Invalid branch name format.");
      return;
    }

    if (!sourceDatabaseUrl) {
      toast.error("Source database URL is required.");
      return;
    }

    setCreatingBranch(true);
    try {
      const created = await api.branches.create({ branchName, sourceDatabaseUrl }, config);
      setCreatedBranch({
        name: created.branchName,
        url: created.branchUrl,
      });
      toast.success(`Branch ${branchName} created.`);
      setNewBranchName("");
      await branchesQuery.refetch();
      setActiveSection("branches");
    } catch {
      toast.error("Failed to create branch. Check the source URL and your GitHub session.");
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleSignIn = () => {
    void beginGithubSignIn("/");
  };

  const handleSignOut = () => {
    void beginGithubSignOut("/login?signedOut=1");
  };

  const handleCopyBranchUrl = async (branchUrl: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable.");
      }
      await navigator.clipboard.writeText(branchUrl);
      toast.success("Branch URL copied to clipboard.");
    } catch {
      toast.error("Could not copy the branch URL. Select it manually.");
    }
  };

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <PublicLanding onSignIn={handleSignIn} />;
  }

  return (
    <div
      className="min-h-screen text-(--gh-fg-default)"
      style={{
        backgroundImage:
          "radial-gradient(circle_at_top_left,rgba(9,105,218,0.08),transparent_28%),linear-gradient(180deg,#f6f8fa_0%,#eef2f7_100%)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden h-screen border-r border-(--gh-border-default) bg-(--gh-canvas-default) md:flex md:w-16 md:flex-col md:items-center md:py-6 lg:w-64 lg:items-stretch">
          <div className="mb-8 px-2 text-center text-sm font-semibold uppercase tracking-[0.18em] text-(--gh-fg-muted) lg:px-6 lg:text-left">
            <span className="md:block lg:hidden">F</span>
            <span className="hidden lg:block">FlowDB</span>
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-2 lg:px-4">
            <button
              type="button"
              onClick={() => setActiveSection("branches")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "branches"
                  ? "bg-(--gh-canvas-subtle) text-(--gh-fg-default)"
                  : "text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs font-semibold">
                B
              </span>
              <span className="hidden lg:inline">Branches</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("setup")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "setup"
                  ? "bg-(--gh-canvas-subtle) text-(--gh-fg-default)"
                  : "text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs font-semibold">
                W
              </span>
              <span className="hidden lg:inline">Setup Wizard</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("settings")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "settings"
                  ? "bg-(--gh-canvas-subtle) text-(--gh-fg-default)"
                  : "text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs font-semibold">
                S
              </span>
              <span className="hidden lg:inline">Settings</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("guide")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "guide"
                  ? "bg-(--gh-canvas-subtle) text-(--gh-fg-default)"
                  : "text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs font-semibold">
                G
              </span>
              <span className="hidden lg:inline">GitHub Guide</span>
            </button>
          </nav>

          <div className="border-t border-(--gh-border-default) px-2 pt-4 lg:px-4">
            <div className="mb-3 hidden items-center gap-3 rounded-xl border border-(--gh-border-default) p-2 lg:flex">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="h-9 w-9 rounded-full border border-(--gh-border-default) object-cover"
                />
              ) : (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-(--gh-canvas-subtle) text-xs font-semibold text-(--gh-fg-muted)">
                  {initials || "GH"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-(--gh-fg-default)">{userName}</p>
                <p className="truncate text-xs text-(--gh-fg-muted)">
                  {githubLogin ? `@${githubLogin}` : githubId ? `GitHub #${githubId}` : "Not signed in"}
                </p>
              </div>
            </div>

            <div className="mb-2 flex items-center gap-2 rounded-lg border border-(--gh-border-default) px-2 py-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`}
              />
              <span className="text-(--gh-fg-muted)">
                {isConnected ? "Connected" : "Orchestrator offline"}
              </span>
            </div>
            {!isConnected ? (
              <p className="mb-2 text-xs text-(--gh-fg-muted)">Check {config.orchestratorUrl}</p>
            ) : null}

            <button
              type="button"
              onClick={() => setActiveSection("settings")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs">
                T
              </span>
              <span className="hidden lg:inline">Theme Settings</span>
            </button>

            {isSignedIn ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--gh-border-default) text-xs">
                  O
                </span>
                <span className="hidden lg:inline">Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="mt-2 flex w-full items-center gap-3 rounded-xl bg-(--gh-accent-emphasis) px-3 py-2 text-sm text-white hover:brightness-110"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/40 text-xs">
                  I
                </span>
                <span className="hidden lg:inline">Sign in with GitHub</span>
              </button>
            )}
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <WorkspaceOrientation
            steps={setupSteps}
            isSignedIn={isSignedIn}
            onSignIn={handleSignIn}
            onOpenSetup={() => setActiveSection("setup")}
            onOpenBranches={() => setActiveSection("branches")}
          />

          <header className="mb-6 rounded-2xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="m-0 text-xl font-semibold text-(--gh-fg-default)">
                    FlowDB Dashboard
                  </h1>
                  {githubLogin && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-(--gh-border-default) bg-(--gh-canvas-subtle) px-2.5 py-0.5 text-xs font-medium text-(--gh-fg-muted)">
                      {userAvatar && (
                        <img
                          src={userAvatar}
                          alt={githubLogin}
                          className="h-3.5 w-3.5 rounded-full object-cover"
                        />
                      )}
                      @{githubLogin}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-(--gh-fg-muted)">
                  Orchestrator: {config.orchestratorUrl}
                </p>
                <p className="mt-1 text-xs text-(--gh-fg-muted)">
                  Setup progress: {setupCompletedCount}/{setupSteps.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-(--gh-fg-muted)">
                  Last updated {lastUpdatedSeconds}s ago
                </p>
                <button
                  type="button"
                  onClick={() => void branchesQuery.refetch()}
                  className="rounded-lg bg-(--gh-accent-emphasis) px-3 py-2 text-sm text-white hover:brightness-110"
                >
                  Refresh
                </button>
              </div>
            </div>
            {firstIncompleteStep ? (
              <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">Finish setup to unlock branch creation.</p>
                <p className="mt-1 text-amber-800 dark:text-amber-200">
                  Next step: {firstIncompleteStep.label}.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection("setup")}
                  className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500"
                >
                  Continue setup
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                <p className="font-medium">Your workspace is ready.</p>
                <p className="mt-1 text-emerald-800 dark:text-emerald-200">
                  You can create branches and monitor health from the branches tab.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection("branches")}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Go to branches
                </button>
              </div>
            )}
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branchesQuery.isLoading
              ? [0, 1, 2].map((idx) => <StatCardSkeleton key={idx} />)
              : stats.map((stat) => (
                  <article
                    key={stat.label}
                    className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4"
                  >
                    <p className="text-sm text-(--gh-fg-muted)">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-(--gh-fg-default)">
                      {stat.value}
                    </p>
                  </article>
                ))}
          </section>

          {!hasRequiredConfig ? (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Setup is incomplete. Finish the Setup Wizard before creating branches.
            </div>
          ) : null}

          {activeSection === "setup" ? (
            <SetupWizard
              steps={setupSteps}
              draftConfig={draftConfig}
              isSignedIn={isSignedIn}
              onSignIn={handleSignIn}
              onConfigChange={(patch) => {
                setDraftConfig((current) => ({ ...current, ...patch }));
              }}
              onSave={handleWizardSaveAndContinue}
            />
          ) : activeSection === "branches" ? (
            <section className="mt-6 space-y-6">
              {createdBranch ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                  <p className="font-medium">Branch created: {createdBranch.name}</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-all font-mono text-xs text-emerald-800 dark:text-emerald-200">
                      {createdBranch.url}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyBranchUrl(createdBranch.url)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              ) : null}

              <BranchCreateForm
                requiresAuth={!hasFlowDbToken}
                creating={creatingBranch}
                branchName={newBranchName}
                sourceDatabaseUrl={newSourceDatabaseUrl}
                onBranchNameChange={setNewBranchName}
                onSourceDatabaseUrlChange={setNewSourceDatabaseUrl}
                onSignIn={handleSignIn}
                onSubmit={(event) => {
                  void handleCreateBranch(event);
                }}
              />

              <div>
                <h2 className="mb-3 text-base font-medium text-(--gh-fg-default)">
                  Branch Health Feed
                </h2>
                <BranchHealthFeed
                  data={branches}
                  isLoading={branchesQuery.isLoading}
                  isError={branchesQuery.isError}
                  requiresAuth={!hasFlowDbToken}
                  deletingBranch={deletingBranch}
                  onRetry={() => {
                    void branchesQuery.refetch();
                  }}
                  onSignIn={handleSignIn}
                  onTeardown={handleTeardown}
                />
              </div>
            </section>
          ) : activeSection === "guide" ? (
            <GithubAppGuide />
          ) : (
            <section className="mt-6 rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-5">
              <h2 className="m-0 text-base font-medium text-(--gh-fg-default)">Settings</h2>
              <p className="mt-2 text-sm text-(--gh-fg-muted)">
                Configure project/environment and dashboard appearance.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm text-(--gh-fg-muted)">
                  Orchestrator URL
                  <input
                    type="text"
                    value={draftConfig.orchestratorUrl}
                    onChange={(event) =>
                      setDraftConfig((current) => ({
                        ...current,
                        orchestratorUrl: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
                    placeholder="http://localhost:3000"
                  />
                </label>
                <label className="text-sm text-(--gh-fg-muted)">
                  Environment
                  <input
                    type="text"
                    value={draftConfig.environment}
                    onChange={(event) =>
                      setDraftConfig((current) => ({ ...current, environment: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
                    placeholder="local"
                  />
                </label>
                <label className="text-sm text-(--gh-fg-muted)">
                  Organization Slug
                  <input
                    type="text"
                    value={draftConfig.orgSlug}
                    onChange={(event) =>
                      setDraftConfig((current) => ({ ...current, orgSlug: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
                    placeholder="acme"
                  />
                </label>
                <label className="text-sm text-(--gh-fg-muted)">
                  Project Slug
                  <input
                    type="text"
                    value={draftConfig.projectSlug}
                    onChange={(event) =>
                      setDraftConfig((current) => ({ ...current, projectSlug: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
                    placeholder="flowdb"
                  />
                </label>
                <label className="text-sm text-(--gh-fg-muted)">
                  Source Database URL
                  <input
                    type="url"
                    value={draftConfig.sourceDatabaseUrl}
                    onChange={(event) =>
                      setDraftConfig((current) => ({
                        ...current,
                        sourceDatabaseUrl: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
                    placeholder="postgresql://user:pass@host:5432/db"
                  />
                </label>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveSettings();
                  }}
                  className="rounded-lg bg-(--gh-accent-emphasis) px-3 py-2 text-sm text-white hover:brightness-110"
                >
                  Save Settings
                </button>
              </div>
              <p className="mt-4 text-sm text-(--gh-fg-muted)">
                Choose the dashboard appearance theme.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    { key: "light", label: "Light" },
                    { key: "dark", label: "Dark" },
                    { key: "system", label: "System" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setTheme(mode.key)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      themeMode === mode.key
                        ? "border-(--gh-accent-emphasis) bg-(--gh-canvas-subtle) text-(--gh-fg-default)"
                        : "border-(--gh-border-default) text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-(--gh-fg-muted)">
                Current mode: {themeMode}. Dashboard data refreshes every 30 seconds.
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
