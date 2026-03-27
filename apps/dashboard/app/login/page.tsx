"use client";

import { signIn } from "next-auth/react";
import { toast } from "sonner";

type AuthProvidersResponse = {
  github?: {
    signinUrl?: string;
  };
};

export default function LoginPage() {
  const handleGithubLogin = async () => {
    try {
      const response = await fetch("/api/auth/providers", { cache: "no-store" });
      const providers = (await response.json()) as AuthProvidersResponse;
      const signinUrl = providers.github?.signinUrl ?? "";

      if (signinUrl.includes("client_id=YOUR_") || signinUrl.includes("client_id=dummy")) {
        toast.error(
          "GitHub OAuth is not configured yet. Set real GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in apps/dashboard/.env.local."
        );
        return;
      }
    } catch {
      toast.error("Unable to verify GitHub OAuth settings. Please try again.");
      return;
    }

    await signIn("github", { callbackUrl: "/" });
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
        <button
          type="button"
          onClick={() => void handleGithubLogin()}
          className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Continue with GitHub
        </button>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Configure GitHub OAuth credentials in apps/dashboard/.env.local
        </p>
      </section>
    </main>
  );
}
