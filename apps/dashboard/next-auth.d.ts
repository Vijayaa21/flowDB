import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    token?: string;
    user: DefaultSession["user"] & {
      githubId?: string;
      githubLogin?: string;
      displayName?: string;
      avatarUrl?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubId?: string;
    githubLogin?: string;
    githubEmail?: string;
    displayName?: string;
    avatarUrl?: string;
    flowdbToken?: string;
  }
}
