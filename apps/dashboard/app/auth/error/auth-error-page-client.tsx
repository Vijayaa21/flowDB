"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

function errorMessage(error: string | null): string {
  switch (error) {
    case "AccessDenied":
      return "GitHub denied the sign-in request. Approve access and try again.";
    case "OAuthCallback":
    case "OAuthSignin":
      return "GitHub OAuth could not complete. Check the callback URL and credentials.";
    case "Configuration":
      return "The dashboard is missing a required GitHub OAuth setting.";
    default:
      return "GitHub sign-in failed. Check the dashboard auth settings and try again.";
  }
}

export default function AuthErrorPageClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(9,105,218,0.18),transparent_30%),linear-gradient(180deg,_#f6f8fa_0%,_#eef2f7_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8 dark:text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl items-center">
        <section className="w-full rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            FlowDB auth error
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
            GitHub sign-in needs attention.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
            {errorMessage(error)}
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">Quick checks</p>
            <ul className="mt-2 list-disc pl-5">
              <li>Confirm the GitHub OAuth callback URL matches /api/auth/callback/github.</li>
              <li>Verify GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and AUTH_SECRET are set.</li>
              <li>Make sure you are using the same base URL you registered in GitHub.</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Back to login
            </Link>
            <Link
              href="/signup"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Try signup
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
