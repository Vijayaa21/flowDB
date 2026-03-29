import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    token?: string;
    user: DefaultSession["user"] & {
      githubId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubId?: string;
    flowdbToken?: string;
  }
}
