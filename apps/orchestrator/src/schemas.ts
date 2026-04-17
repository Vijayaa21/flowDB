import { z } from "zod";

export const githubPullRequestSchema = z.object({
  action: z.enum(["opened", "reopened", "closed"]),
  pull_request: z.object({
    number: z.number().int(),
    head: z.object({
      ref: z.string().min(1),
    }),
  }),
});

export const githubPushSchema = z.object({
  ref: z.string().min(1),
  repository: z
    .object({
      name: z.string().min(1),
      owner: z.object({
        login: z.string().min(1),
      }),
    })
    .optional(),
});

export const vercelWebhookSchema = z.object({
  type: z.string().min(1),
  payload: z
    .object({
      deployment: z
        .object({
          id: z.string().min(1),
          target: z.string().optional(),
          meta: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
      git: z
        .object({
          branch: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const forkBranchSchema = z.object({
  sourceDatabaseUrl: z.string().url(),
  branchName: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid branch name format."),
});
