"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, { title: string; description: string; action?: string }> = {
  Configuration: {
    title: "OAuth configuration error",
    description:
      "The GitHub OAuth app is not properly configured. Check that GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and AUTH_SECRET are correctly set.",
    action: "Contact your administrator or check the deployment environment variables.",
  },
  AccessDenied: {
    title: "Access denied",
    description: "You cancelled the GitHub sign-in or your account does not have permission to access FlowDB.",
    action: "Try signing in again. If the problem persists, contact your organization admin.",
  },
  Verification: {
    title: "Sign-in link expired",
    description: "The sign-in link you used has expired or has already been used.",
    action: "Request a new sign-in link.",
  },
  OAuthSignin: {
    title: "GitHub OAuth error",
    description: "Something went wrong while redirecting you to GitHub. This is usually a temporary issue.",
    action: "Wait a moment and try again.",
  },
  OAuthCallback: {
    title: "OAuth callback error",
    description:
      "GitHub returned an error during authentication. The OAuth callback URL may not match what is registered in your GitHub OAuth App.",
    action:
      "Ensure the Authorization callback URL in your GitHub OAuth App matches: {origin}/api/auth/callback/github",
  },
  OAuthCreateAccount: {
    title: "Account creation failed",
    description: "FlowDB could not create your account from the GitHub profile.",
    action: "Try signing in again. If the error continues, contact support.",
  },
  SessionRequired: {
    title: "Sign-in required",
    description: "You need to be signed in to access this page.",
    action: "Sign in with GitHub to continue.",
  },
};

function AuthErrorContent() {
  const params = useSearchParams();
  const errorCode = params.get("error") ?? "unknown";
  const info = ERROR_MESSAGES[errorCode] ?? {
    title: "Authentication error",
    description:
      "An unexpected error occurred during sign-in. This might be a temporary issue with GitHub or the FlowDB configuration.",
    action: "Try signing in again. If this keeps happening, check the server logs.",
  };

  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(9,105,218,0.1), transparent 40%), linear-gradient(180deg,#f6f8fa 0%,#eef2f7 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-(--gh-border-default) bg-white p-8 shadow-[0_20px_60px_rgba(36,41,47,0.1)] dark:bg-(--gh-canvas-default)">
          {/* Logo */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, #0969da, #2563eb)" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5" />
                <path d="M7 10h6M10 7v6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-(--gh-fg-default)">FlowDB</span>
          </div>

          {/* Error icon */}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              className="text-red-600 dark:text-red-400"
            >
              <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 7v5M11 15h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-(--gh-fg-default)">{info.title}</h1>
          <p className="mt-2 text-sm leading-6 text-(--gh-fg-muted)">{info.description}</p>

          {info.action && (
            <div className="mt-4 rounded-lg border border-(--gh-border-default) bg-(--gh-canvas-subtle) px-4 py-3">
              <p className="text-xs leading-5 text-(--gh-fg-muted)">
                <strong className="font-medium text-(--gh-fg-default)">What to do: </strong>
                {info.action.replace("{origin}", typeof window !== "undefined" ? window.location.origin : "")}
              </p>
            </div>
          )}

          {/* Error code badge */}
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full border border-(--gh-border-default) px-2 py-0.5 font-mono text-xs text-(--gh-fg-muted)">
              error: {errorCode}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--gh-accent-emphasis) px-4 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Try again with GitHub
            </a>
            <a
              href="/"
              className="flex w-full items-center justify-center rounded-xl border border-(--gh-border-default) px-4 py-2.5 text-sm font-medium text-(--gh-fg-muted) hover:bg-(--gh-canvas-subtle) hover:text-(--gh-fg-default)"
            >
              Back to home
            </a>
          </div>
        </div>

        {/* Help links */}
        <p className="mt-6 text-center text-xs text-(--gh-fg-muted)">
          Need help?{" "}
          <a
            href="https://github.com/Vijayaa21/flowDB/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--gh-accent-fg) hover:underline"
          >
            Open an issue on GitHub
          </a>
        </p>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AuthErrorContent />
    </Suspense>
  );
}
