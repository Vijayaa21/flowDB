/**
 * FlowDB SDK Contract Types
 * Defines the TypeScript types for FlowDB orchestrator API contracts
 */

/**
 * Branch status enumeration
 */
export type BranchStatus = "creating" | "active" | "tearing_down" | "deleted" | "failed";

/**
 * Branch data transfer object
 */
export interface BranchDto {
  id: string;
  projectId: string;
  name: string;
  databaseName: string;
  databaseUrl: string;
  sourceDatabaseName: string;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Fork operation status enumeration
 */
export type OperationStatus = "queued" | "running" | "succeeded" | "failed" | "timed_out";

/**
 * Fork operation data transfer object
 */
export interface OperationDto {
  id: string;
  projectId: string;
  branchId?: string | null;
  idempotencyKey: string;
  requestedBy: string;
  status: OperationStatus;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  nextCursor?: string;
  limit: number;
  total: number;
}

/**
 * List branches response
 */
export interface ListBranchesResponse {
  items: BranchDto[];
  page: PaginationMeta;
}

/**
 * Create branch response
 */
export interface CreateBranchResponse {
  branch: BranchDto;
  operation: OperationDto;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}
