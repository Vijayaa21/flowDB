import { z } from "zod";

export const githubPullRequestSchema = z.object({
  action: z.enum(["opened", "closed"]),
  pull_request: z.object({
    number: z.number().int(),
    head: z.object({
      ref: z.string().min(1)
    })
  })
});

export const githubPushSchema = z.object({
  ref: z.string().min(1)
});

export const vercelWebhookSchema = z.object({
  type: z.string().min(1),
  payload: z
    .object({
      deployment: z
        .object({
          id: z.string().min(1),
          target: z.string().optional(),
          meta: z.record(z.string()).optional()
        })
        .optional(),
      git: z
        .object({
          branch: z.string().optional()
        })
        .optional()
    })
    .optional()
});