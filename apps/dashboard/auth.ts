import NextAuth from "next-auth";
import type { NextAuthConfig, NextAuthResult } from "next-auth";
import GitHub from "next-auth/providers/github";

/*
GitHub OAuth App setup for local FlowDB development:
1. Open GitHub Settings -> Developer settings -> OAuth Apps -> New OAuth App.
2. Set Homepage URL to http://localhost:4010.
3. Set Authorization callback URL to http://localhost:4010/api/auth/callback/github.
4. Copy the client ID and client secret into dashboard environment variables.
*/

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const authSecret = process.env.AUTH_SECRET;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toUpperCase();
  return (
    normalized.startsWith("YOUR_") ||
    normalized.includes("CHANGE_ME") ||
    normalized.includes("PLACEHOLDER")
  );
}

const fallbackClientId = "dummy";
const fallbackClientSecret = "dummy";
const fallbackAuthSecret = "dev-auth-secret-change-me";

const isProduction = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

function resolveSecretOrThrow(name: string, value: string | undefined, fallback: string): string {
  if (value && !isPlaceholder(value)) {
    return value;
  }

  if (isProduction && !isBuildPhase) {
    throw new Error(`Missing or invalid ${name} in production environment.`);
  }

  return fallback;
}

const resolvedClientId = resolveSecretOrThrow("GITHUB_CLIENT_ID", githubClientId, fallbackClientId);
const resolvedClientSecret = resolveSecretOrThrow(
  "GITHUB_CLIENT_SECRET",
  githubClientSecret,
  fallbackClientSecret
);
const resolvedAuthSecret = resolveSecretOrThrow("AUTH_SECRET", authSecret, fallbackAuthSecret);

function base64UrlEncode(input: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(input));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signFlowDbToken(githubId: string, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      githubId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    })
  );
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const signature = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));

  return `${data}.${signature}`;
}

const authConfig: NextAuthConfig = {
  secret: resolvedAuthSecret,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHub({
      clientId: resolvedClientId,
      clientSecret: resolvedClientSecret,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "github" && account.providerAccountId) {
        token.githubId = account.providerAccountId;
      }
      if (typeof token.githubId === "string") {
        token.flowdbToken = await signFlowDbToken(token.githubId, resolvedAuthSecret);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = typeof token.githubId === "string" ? token.githubId : undefined;
      }
      session.token = typeof token.flowdbToken === "string" ? token.flowdbToken : undefined;
      return session;
    },
  },
};

const nextAuthResult: NextAuthResult = NextAuth(authConfig);

export const handlers = nextAuthResult.handlers;
export const auth: NextAuthResult["auth"] = nextAuthResult.auth;
export const signIn = nextAuthResult.signIn;
export const signOut = nextAuthResult.signOut;
