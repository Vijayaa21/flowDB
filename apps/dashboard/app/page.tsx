"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";

type BranchRecord = {
  branchName: string;
  status?: "active" | "closed" | "error" | "migrating" | string;
  prNumber?: number;
  updatedAt?: string;
};

type SectionKey = "branches" | "settings";

const orchestratorUrl =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3000";

const sidebarItems: Array<{ key: SectionKey; icon: string; label: string }> = [
  { key: "branches", icon: "B", label: "Branches" },
  { key: "settings", icon: "S", label: "Settings" }
];

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-9 w-28 animate-pulse rounded bg-slate-300 dark:bg-slate-700" />
    </div>
  );
}

function BranchTableSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="mb-3 h-12 animate-pulse rounded-lg bg-slate-200 last:mb-0 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {[0, 1, 2].map((idx) => (
        <div key={idx} className="mb-4 flex items-start gap-3 last:mb-0">
          <div className="mt-1 h-3 w-3 animate-pulse rounded-full bg-slate-300 dark:bg-slate-700" />
          <div className="w-full space-y-2">
            <div className="h-3 w-44 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState<SectionKey>("branches");
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showTeardownModal, setShowTeardownModal] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${orchestratorUrl}/branches`, {
        headers: {
          accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Unable to load branches: ${response.status}`);
      }

      const payload = (await response.json()) as BranchRecord[] | { branches: BranchRecord[] };
      setBranches(Array.isArray(payload) ? payload : payload.branches ?? []);
    } catch {
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("flowdb-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : prefersDark;

    setDarkModeEnabled(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape") {
        setShowShortcutsModal(false);
        setShowTeardownModal(false);
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void loadBranches();
      }

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setActiveSection("branches");
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setActiveSection("settings");
      }

      if (event.key === "?") {
        event.preventDefault();
        setShowShortcutsModal(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadBranches]);

  const stats = useMemo(() => {
    const totalBranches = branches.length;
    const activeCount = branches.filter((branch) => branch.status === "active").length;
    const errorCount = branches.filter((branch) => branch.status === "error").length;
    return [
      { label: "Total Branches", value: String(totalBranches) },
      { label: "Active", value: String(activeCount) },
      { label: "Errors", value: String(errorCount) }
    ];
  }, [branches]);

  const toggleTheme = () => {
    const next = !darkModeEnabled;
    setDarkModeEnabled(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("flowdb-theme", next ? "dark" : "light");
  };

  const triggerTeardown = async () => {
    setShowTeardownModal(false);

    try {
      const healthResponse = await fetch(`${orchestratorUrl}/health`, {
        cache: "no-store"
      });

      if (!healthResponse.ok) {
        throw new Error("offline");
      }

      setBranches((current) => current.filter((branch) => branch.branchName !== "feature-auth"));
      toast.success("Branch feature-auth torn down");
    } catch {
      toast.error("Failed to teardown — orchestrator offline");
    }
  };

  const timelineItems = branches.slice(0, 3).map((branch) => ({
    title: `Migration status for ${branch.branchName}`,
    meta: branch.status ?? "active"
  }));

  const userName = session?.user?.name ?? "GitHub User";
  const userAvatar = session?.user?.image ?? "";
  const githubId = session?.user?.githubId ?? "";
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden h-screen border-r border-slate-200 bg-white md:flex md:w-16 md:flex-col md:items-center md:py-6 lg:w-64 lg:items-stretch dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-8 px-2 text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 lg:px-6 lg:text-left dark:text-slate-400">
            <span className="md:block lg:hidden">F</span>
            <span className="hidden lg:block">FlowDB</span>
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-2 lg:px-4">
            {sidebarItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  activeSection === item.key
                    ? "bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-xs font-semibold dark:border-slate-700">
                  {item.icon}
                </span>
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            ))}
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
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {userName}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {githubId ? `GitHub #${githubId}` : "Signed in with GitHub"}
                </p>
              </div>
            </div>

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
                <h1 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">
                  FlowDB Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Orchestrator: {orchestratorUrl}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  ? Shortcuts
                </button>
                <button
                  type="button"
                  onClick={() => void loadBranches()}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Refresh (R)
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 md:hidden">
              {sidebarItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    activeSection === item.key
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {darkModeEnabled ? "Dark" : "Light"}
              </button>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3">
            {isLoading
              ? [0, 1, 2].map((idx) => <StatCardSkeleton key={idx} />)
              : stats.map((stat) => (
                  <article
                    key={stat.label}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                      {stat.value}
                    </p>
                  </article>
                ))}
          </section>

          {activeSection === "branches" ? (
            <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
              <div>
                {isLoading ? (
                  <BranchTableSkeleton />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <h2 className="m-0 text-base font-medium text-slate-900 dark:text-slate-100">
                        Branches
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowTeardownModal(true)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Teardown feature-auth
                      </button>
                    </div>

                    <div className="hidden sm:block">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">PR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branches.map((branch) => (
                            <tr
                              key={branch.branchName}
                              className="border-b border-slate-100 text-sm last:border-b-0 dark:border-slate-800"
                            >
                              <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                                {branch.branchName}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {branch.status ?? "active"}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {branch.prNumber ?? "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-3 p-4 sm:hidden">
                      {branches.map((branch) => (
                        <article
                          key={branch.branchName}
                          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {branch.branchName}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            Status: {branch.status ?? "active"}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            PR: {branch.prNumber ?? "-"}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                {isLoading ? (
                  <TimelineSkeleton />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="m-0 text-base font-medium text-slate-900 dark:text-slate-100">
                      Migration Timeline
                    </h2>
                    <div className="mt-4 space-y-4">
                      {(timelineItems.length > 0
                        ? timelineItems
                        : [
                            { title: "No migrations yet", meta: "idle" },
                            { title: "Waiting for push events", meta: "idle" }
                          ]
                      ).map((item) => (
                        <div key={item.title} className="flex items-start gap-3">
                          <span className="mt-1 h-3 w-3 rounded-full bg-slate-400 dark:bg-slate-500" />
                          <div>
                            <p className="m-0 text-sm text-slate-900 dark:text-slate-100">{item.title}</p>
                            <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{item.meta}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="m-0 text-base font-medium text-slate-900 dark:text-slate-100">Settings</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Keep your FlowDB dashboard configuration aligned with the orchestrator endpoint.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="text-sm text-slate-600 dark:text-slate-300" htmlFor="orchestrator-url">
                  Orchestrator URL
                </label>
                <input
                  id="orchestrator-url"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  defaultValue={orchestratorUrl}
                  readOnly
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toast.success("Configuration saved")}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Save Settings
                </button>
                <button
                  type="button"
                  onClick={() => toast.error("Conflict detected in feature-payment — action required")}
                  className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  Simulate Conflict
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      {showShortcutsModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="animate-in fade-in zoom-in-95 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="m-0 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Keyboard Shortcuts
            </h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li>R: Refresh data</li>
              <li>B: Navigate to Branches</li>
              <li>S: Navigate to Settings</li>
              <li>Escape: Close any open modal</li>
              <li>?: Open keyboard helper</li>
            </ul>
            <button
              type="button"
              onClick={() => setShowShortcutsModal(false)}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showTeardownModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="animate-in fade-in slide-in-from-top-2 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">
              Teardown Branch
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Confirm teardown for feature-auth.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={triggerTeardown}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setShowTeardownModal(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}