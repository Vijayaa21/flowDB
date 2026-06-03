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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          F
        </div>
        <h1 className="mt-5 text-center text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Welcome to FlowDB
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Sign in with GitHub to create your account and continue.
        </p>
        <button
          type="button"
          onClick={() => void handleGithubLogin()}
          className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Continue with GitHub
        </button>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          No password signup is required. Configure GitHub OAuth in apps/dashboard/.env.local.
        </p>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          New here? Visit /signup for the same GitHub onboarding flow.
        </p>
      </section>
    </main>
  );
}
