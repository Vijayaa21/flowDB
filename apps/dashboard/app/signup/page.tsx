"use client";

import { signIn } from "next-auth/react";
import { toast } from "sonner";

export default function SignupPage() {
  const handleGithubSignup = async () => {
    try {
      await signIn("github", { callbackUrl: "/" });
    } catch {
      toast.error("GitHub signup failed. Check apps/dashboard/.env.local OAuth settings.");
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(9,105,218,0.18),transparent_30%),linear-gradient(180deg,#f6f8fa_0%,#eef2f7_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8 dark:text-slate-50">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="rounded-4xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            FlowDB signup
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
            Create your FlowDB account with GitHub.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Signup and login are the same GitHub OAuth flow. That keeps the first experience
            simple while FlowDB is still focused on branch creation and onboarding.
          </p>

          <div className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>1. Connect your GitHub account.</p>
            <p>2. Return to the dashboard as a signed-in user.</p>
            <p>3. Finish setup and start creating branches.</p>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Why this approach?
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              GitHub-only auth reduces friction for new users and matches the product story of
              working with repositories, previews, and database branches.
            </p>
          </div>
        </section>

        <section className="rounded-4xl border border-slate-200 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            F
          </div>
          <h2 className="mt-5 text-center text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Sign up with GitHub
          </h2>
          <p className="mt-2 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
            The same GitHub OAuth flow creates your account and signs you in.
          </p>
          <button
            type="button"
            onClick={() => void handleGithubSignup()}
            className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Sign up with GitHub
          </button>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">Set up first</p>
            <p className="mt-1">Make sure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `AUTH_SECRET` are configured in `apps/dashboard/.env.local` before testing.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
