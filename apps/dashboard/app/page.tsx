"use client";

import { useEffect, useMemo, useState } from "react";
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

type SectionKey = "branches" | "settings";
type ThemeMode = "light" | "dark" | "system";

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

export default function HomePage() {
  const { data: session } = useSession();
  const hasFlowDbToken = Boolean(session?.token);
  const isSignedIn = Boolean(session?.user);
  const [config, setConfig] = useState<DashboardConfig>(() => readDashboardConfig());
  const [draftConfig, setDraftConfig] = useState<DashboardConfig>(() => readDashboardConfig());
  const [activeSection, setActiveSection] = useState<SectionKey>("branches");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [now, setNow] = useState(Date.now());
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);

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

  const handleSaveSettings = async () => {
    const orchestratorValue = draftConfig.orchestratorUrl.trim();
    if (!orchestratorValue) {
      toast.error("Orchestrator URL is required.");
      return;
    }

    const nextConfig = saveDashboardConfig({
      ...draftConfig,
      orchestratorUrl: orchestratorValue,
    });

    setConfig(nextConfig);
    setDraftConfig(nextConfig);
    toast.success("Dashboard settings saved.");
    await Promise.all([branchesQuery.refetch(), healthQuery.refetch()]);
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

          {activeSection === "branches" ? (
            <section className="mt-6">
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
            </section>
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
