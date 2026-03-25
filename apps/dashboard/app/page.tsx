"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";

import { api, type Branch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

type SectionKey = "branches" | "settings";

const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3000";

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
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-9 w-28 animate-pulse rounded bg-slate-300 dark:bg-slate-700" />
    </div>
  );
}

function BranchFeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
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
          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{normalized}</span>;
}

function BranchHealthFeed({
  data,
  isLoading,
  isError,
  onRetry
}: {
  data: Branch[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        No active branches — open a PR to get started
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((branch) => (
        <article
          key={`${branch.branchName}-${branch.updatedAt ?? "na"}`}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 text-sm font-medium text-slate-900 dark:text-slate-100">{branch.branchName}</p>
            <StatusBadge status={branch.status} />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Updated {timeAgo(branch.updatedAt)}</p>
        </article>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState<SectionKey>("branches");
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [now, setNow] = useState(Date.now());

  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: api.branches.list,
    refetchInterval: 30000
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health.check,
    refetchInterval: 60000
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("flowdb-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : prefersDark;
    setDarkModeEnabled(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const branches = branchesQuery.data ?? [];
  const stats = useMemo(() => {
    const totalBranches = branches.length;
    const activeMigrations = branches.filter((branch) => statusUpper(branch.status) === "MIGRATING").length;
    const conflictAlerts = branches.filter((branch) => statusUpper(branch.status) === "CONFLICT").length;
    return [
      { label: "Total Branches", value: String(totalBranches) },
      { label: "Active Migrations", value: String(activeMigrations) },
      { label: "Conflict Alerts", value: String(conflictAlerts) }
    ];
  }, [branches]);

  const lastUpdatedSeconds =
    branchesQuery.dataUpdatedAt > 0 ? Math.max(0, Math.floor((now - branchesQuery.dataUpdatedAt) / 1000)) : 0;

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

  const toggleTheme = () => {
    const next = !darkModeEnabled;
    setDarkModeEnabled(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("flowdb-theme", next ? "dark" : "light");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden h-screen border-r border-slate-200 bg-white md:flex md:w-16 md:flex-col md:items-center md:py-6 lg:w-64 lg:items-stretch dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-8 px-2 text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 lg:px-6 lg:text-left dark:text-slate-400">
            <span className="md:block lg:hidden">F</span>
            <span className="hidden lg:block">FlowDB</span>
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-2 lg:px-4">
            <button
              type="button"
              onClick={() => setActiveSection("branches")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "branches"
                  ? "bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-xs font-semibold dark:border-slate-700">
                B
              </span>
              <span className="hidden lg:inline">Branches</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("settings")}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                activeSection === "settings"
                  ? "bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-xs font-semibold dark:border-slate-700">
                S
              </span>
              <span className="hidden lg:inline">Settings</span>
            </button>
          </nav>

          <div className="border-t border-slate-200 px-2 pt-4 lg:px-4 dark:border-slate-800">
            <div className="mb-3 hidden items-center gap-3 rounded-xl border border-slate-200 p-2 lg:flex dark:border-slate-800">
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatar}
                  alt={userName}
                  className="h-9 w-9 rounded-full border border-slate-300 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {initials || "GH"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{userName}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {githubId ? `GitHub #${githubId}` : "Signed in with GitHub"}
                </p>
              </div>
            </div>

            <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-800">
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="text-slate-600 dark:text-slate-300">
                {isConnected ? "Connected" : "Orchestrator offline"}
              </span>
            </div>
            {!isConnected ? (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Check {orchestratorUrl}</p>
            ) : null}

            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-xs dark:border-slate-700">
                {darkModeEnabled ? "D" : "L"}
              </span>
              <span className="hidden lg:inline">{darkModeEnabled ? "Dark" : "Light"} Mode</span>
            </button>

            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-xs dark:border-slate-700">
                O
              </span>
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">FlowDB Dashboard</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Orchestrator: {orchestratorUrl}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Last updated {lastUpdatedSeconds}s ago</p>
                <button
                  type="button"
                  onClick={() => void branchesQuery.refetch()}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
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
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</p>
                  </article>
                ))}
          </section>

          {activeSection === "branches" ? (
            <section className="mt-6">
              <h2 className="mb-3 text-base font-medium text-slate-900 dark:text-slate-100">Branch Health Feed</h2>
              <BranchHealthFeed
                data={branches}
                isLoading={branchesQuery.isLoading}
                isError={branchesQuery.isError}
                onRetry={() => {
                  void branchesQuery.refetch();
                }}
              />
            </section>
          ) : (
            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="m-0 text-base font-medium text-slate-900 dark:text-slate-100">Settings</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Dashboard data refreshes every 30 seconds.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
