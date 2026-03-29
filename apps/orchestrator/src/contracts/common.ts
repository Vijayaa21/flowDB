import { z } from "zod";

export const errorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "TIMEOUT"
]);

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional()
});

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase slug (kebab-case).");

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const metadataEnvelopeSchema = z.object({
  requestId: z.string().min(1),
  timestamp: isoDateTimeSchema
});

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const paginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative().optional()
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type MetadataEnvelope = z.infer<typeof metadataEnvelopeSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
