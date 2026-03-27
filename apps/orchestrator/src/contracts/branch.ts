import { z } from "zod";

import {
  isoDateTimeSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  slugSchema
} from "./common";
import { forkOperationDtoSchema } from "./operation";

export const branchStatusSchema = z.enum([
  "creating",
  "active",
  "tearing_down",
  "deleted",
  "failed"
]);

export const branchNameSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid branch name format.");

export const branchDtoSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: branchNameSchema,
  databaseName: z.string().min(1),
  databaseUrl: z.string().url(),
  sourceDatabaseName: z.string().min(1),
  status: branchStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable()
});

export const branchScopeParamsSchema = z.object({
  organizationSlug: slugSchema,
  projectSlug: slugSchema
});

export const createBranchRequestBodySchema = z.object({
  branchName: branchNameSchema,
  sourceDatabaseUrl: z.string().url().optional(),
  idempotencyKey: z.string().min(1)
});

export const createBranchResponseSchema = z.object({
  branch: branchDtoSchema,
  operation: forkOperationDtoSchema
});

export const listBranchesQuerySchema = paginationQuerySchema.extend({
  status: branchStatusSchema.optional()
});

export const listBranchesResponseSchema = z.object({
  items: z.array(branchDtoSchema),
  page: paginationMetaSchema
});

export const deleteBranchParamsSchema = branchScopeParamsSchema.extend({
  branchName: branchNameSchema
});

export const deleteBranchResponseSchema = z.object({
  success: z.literal(true),
  branchName: branchNameSchema
});

export type BranchStatus = z.infer<typeof branchStatusSchema>;
export type BranchDto = z.infer<typeof branchDtoSchema>;
export type BranchScopeParams = z.infer<typeof branchScopeParamsSchema>;
export type CreateBranchRequestBody = z.infer<typeof createBranchRequestBodySchema>;
export type CreateBranchResponse = z.infer<typeof createBranchResponseSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;
export type ListBranchesResponse = z.infer<typeof listBranchesResponseSchema>;
export type DeleteBranchParams = z.infer<typeof deleteBranchParamsSchema>;
export type DeleteBranchResponse = z.infer<typeof deleteBranchResponseSchema>;
