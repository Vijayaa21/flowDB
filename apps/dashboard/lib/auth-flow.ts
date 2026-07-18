"use client";

import { signIn, signOut } from "next-auth/react";

function normalizeRelativeUrl(rawUrl: string | null | undefined, fallback: string): string {
  if (!rawUrl) {
    return fallback;
  }

  try {
    const target = new URL(rawUrl, window.location.origin);
    if (target.origin !== window.location.origin) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function resolveAuthCallbackUrl(rawUrl: string | null | undefined, fallback = "/"): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  return normalizeRelativeUrl(rawUrl, fallback);
}

export async function beginGithubSignIn(callbackUrl: string): Promise<void> {
  const response = await signIn("github", {
    redirect: false,
    callbackUrl,
  });

  if (!response?.url) {
    throw new Error("GitHub sign-in could not be started.");
  }

  window.location.assign(response.url);
}

export async function beginGithubSignOut(callbackUrl: string): Promise<void> {
  const response = await signOut({
    redirect: false,
    callbackUrl,
  });

  if (!response?.url) {
    throw new Error("GitHub sign-out could not be completed.");
  }

  window.location.assign(response.url);
}
