"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  api,
  readDashboardConfig,
  saveDashboardConfig,
  type Branch,
  type DashboardConfig,
} from "../lib/api";
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
        The dashboard sends this request to the orchestrator at <span className="font-medium">POST /branches/fork</span>.
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
      <div className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4 text-sm text-(--gh-fg-muted)">
        No active branches — open a PR to get started
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
  const completed = steps.filter((step) => step.isDone).length;

  return (
    <section className="rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-medium text-(--gh-fg-default)">Project Setup Wizard</h2>
          <p className="mt-1 text-sm text-(--gh-fg-muted)">
            Complete these steps once to start creating and managing branches.
          </p>
        </div>
        <span className="rounded-full border border-(--gh-border-default) px-3 py-1 text-xs text-(--gh-fg-muted)">
          {completed}/{steps.length} completed
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {steps.map((step) => (
          <div
            key={step.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-(--gh-fg-default)">{step.label}</p>
              <p className="text-xs text-(--gh-fg-muted)">{step.description}</p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                step.isDone
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              }`}
            >
              {step.isDone ? "Done" : "Pending"}
            </span>
          </div>
        ))}
      </div>

      {!isSignedIn ? (
        <div className="mt-4 rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="text-sm text-(--gh-fg-muted)">Sign in with GitHub to unlock branch actions.</p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-2 rounded-lg bg-(--gh-accent-emphasis) px-3 py-2 text-sm text-white hover:brightness-110"
          >
            Sign in with GitHub
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm text-(--gh-fg-muted)">
          Orchestrator URL
          <input
            type="text"
            value={draftConfig.orchestratorUrl}
            onChange={(event) => onConfigChange({ orchestratorUrl: event.target.value })}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="http://localhost:3000"
          />
        </label>
        <label className="text-sm text-(--gh-fg-muted)">
          Environment
          <input
            type="text"
            value={draftConfig.environment}
            onChange={(event) => onConfigChange({ environment: event.target.value })}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="local"
          />
        </label>
        <label className="text-sm text-(--gh-fg-muted)">
          Organization Slug
          <input
            type="text"
            value={draftConfig.orgSlug}
            onChange={(event) => onConfigChange({ orgSlug: event.target.value })}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="acme"
          />
        </label>
        <label className="text-sm text-(--gh-fg-muted)">
          Project Slug
          <input
            type="text"
            value={draftConfig.projectSlug}
            onChange={(event) => onConfigChange({ projectSlug: event.target.value })}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="flowdb"
          />
        </label>
        <label className="text-sm text-(--gh-fg-muted) md:col-span-2">
          Source Database URL
          <input
            type="url"
            value={draftConfig.sourceDatabaseUrl}
            onChange={(event) => onConfigChange({ sourceDatabaseUrl: event.target.value })}
            className="mt-1 w-full rounded-md border border-(--gh-border-default) bg-transparent px-3 py-2 text-(--gh-fg-default)"
            placeholder="postgresql://user:pass@host:5432/db"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => {
          void onSave();
        }}
        className="mt-4 rounded-lg bg-(--gh-accent-emphasis) px-4 py-2 text-sm text-white hover:brightness-110"
      >
        Save and Continue
      </button>
    </section>
  );
}

function GithubAppGuide() {
  return (
    <section className="mt-6 rounded-xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-5">
      <h2 className="m-0 text-base font-medium text-(--gh-fg-default)">GitHub App Integration Guide</h2>
      <p className="mt-2 text-sm text-(--gh-fg-muted)">
        Connect FlowDB to your repository so pull requests can create and teardown database branches automatically.
      </p>

      <div className="mt-4 space-y-3 text-sm text-(--gh-fg-muted)">
        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">1. Register the GitHub App from manifest</p>
          <p className="mt-1">Open the org app creation page and paste the manifest from integrations/github-app/app.yml.</p>
          <p className="mt-1 font-mono text-xs">https://github.com/organizations/&lt;org&gt;/settings/apps/new?state=flowdb</p>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">2. Capture generated credentials</p>
          <p className="mt-1">Save App ID, Client ID, Client Secret, Webhook Secret, and Private Key securely.</p>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">3. Configure orchestrator environment</p>
          <ul className="mt-2 list-disc pl-5 text-xs">
            <li>GITHUB_WEBHOOK_SECRET</li>
            <li>GITHUB_TOKEN (installation token)</li>
            <li>DATABASE_URL</li>
          </ul>
        </div>

        <div className="rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) p-3">
          <p className="font-medium text-(--gh-fg-default)">4. Install and validate</p>
          <p className="mt-1">Install the app on your repo, then confirm webhook deliveries reach /webhooks/github.</p>
          <p className="mt-1">Open a PR to trigger branch creation and close it to trigger teardown.</p>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
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

  const userName = session?.user?.name ?? "GitHub User";
  const userAvatar = session?.user?.image ?? "";
  const githubId = session?.user?.githubId ?? "";
  const initials = userName
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
      await api.branches.create({ branchName, sourceDatabaseUrl }, config);
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
    void signIn("github", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-(--gh-canvas-subtle) text-(--gh-fg-default)">
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
                  {githubId ? `GitHub #${githubId}` : "Not signed in"}
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
                onClick={() => void signOut({ callbackUrl: "/login" })}
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
          <header className="mb-6 rounded-2xl border border-(--gh-border-default) bg-(--gh-canvas-default) p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="m-0 text-xl font-semibold text-(--gh-fg-default)">
                  FlowDB Dashboard
                </h1>
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
