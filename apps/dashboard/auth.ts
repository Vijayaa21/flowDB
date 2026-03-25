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

if (!githubClientId) {
  throw new Error("Missing GITHUB_CLIENT_ID in dashboard environment.");
}
if (!githubClientSecret) {
  throw new Error("Missing GITHUB_CLIENT_SECRET in dashboard environment.");
}
if (!authSecret) {
  throw new Error("Missing AUTH_SECRET in dashboard environment.");
}
if (isPlaceholder(githubClientId)) {
  throw new Error(
    "Invalid GITHUB_CLIENT_ID. Replace placeholder value with your real GitHub OAuth App client ID."
  );
}
if (isPlaceholder(githubClientSecret)) {
  throw new Error(
    "Invalid GITHUB_CLIENT_SECRET. Replace placeholder value with your real GitHub OAuth App client secret."
  );
}
if (isPlaceholder(authSecret)) {
  throw new Error(
    "Invalid AUTH_SECRET. Replace placeholder value with a strong random secret for local auth sessions."
  );
}

const authConfig: NextAuthConfig = {
  secret: authSecret,
  trustHost: true,
  session: {
    strategy: "jwt"
  },
  providers: [
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "github" && account.providerAccountId) {
        token.githubId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId =
          typeof token.githubId === "string" ? token.githubId : undefined;
      }
      return session;
    }
  }
};

const nextAuthResult: NextAuthResult = NextAuth(authConfig);

export const handlers = nextAuthResult.handlers;
export const auth = nextAuthResult.auth;
export const signIn = nextAuthResult.signIn;
export const signOut = nextAuthResult.signOut;
