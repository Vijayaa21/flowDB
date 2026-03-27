import { z } from "zod";

import { apiErrorSchema, isoDateTimeSchema } from "./common";

export const forkOperationStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out"
]);

export const forkOperationDtoSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  branchId: z.string().min(1).nullable(),
  idempotencyKey: z.string().min(1),
  requestedBy: z.string().min(1),
  status: forkOperationStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: apiErrorSchema.nullable()
});

export type ForkOperationStatus = z.infer<typeof forkOperationStatusSchema>;
export type ForkOperationDto = z.infer<typeof forkOperationDtoSchema>;
