"use client";

import { signIn } from "next-auth/react";
import { toast } from "sonner";

export default function LoginPage() {
  const handleGithubLogin = async () => {
    try {
      await signIn("github", { callbackUrl: "/" });
    } catch {
      toast.error("GitHub login failed. Check apps/dashboard/.env.local OAuth settings.");
      return;
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(9,105,218,0.18),_transparent_30%),linear-gradient(180deg,_#f6f8fa_0%,_#eef2f7_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8 dark:text-slate-50">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            FlowDB login
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
            Sign in and return to your branch workspace.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            GitHub is the only account provider right now. That keeps the flow simple for new
            users and removes password setup from the first run.
          </p>

          <div className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>1. Authenticate with GitHub.</p>
            <p>2. Get redirected back to the dashboard.</p>
            <p>3. Continue setup or create your first branch.</p>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              New to FlowDB?
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              After sign in, the dashboard walks you through setup, branch creation, and the
              GitHub App guide in a step-by-step layout.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            F
          </div>
          <h2 className="mt-5 text-center text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Continue with GitHub
          </h2>
          <p className="mt-2 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
            This creates or reuses your FlowDB account and sends you back to the dashboard.
          </p>
          <button
            type="button"
            onClick={() => void handleGithubLogin()}
            className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Continue with GitHub
          </button>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">Before you continue</p>
            <p className="mt-1">Make sure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `AUTH_SECRET` are set in `apps/dashboard/.env.local`.</p>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            New here? Visit /signup. It uses the same GitHub onboarding flow.
          </p>
        </section>
      </div>
    </main>
  );
}
