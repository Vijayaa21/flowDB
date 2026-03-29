/**
 * FlowDB SDK - Public API
 * Export all public types and classes for SDK consumers
 */

// Main client
export { FlowDBClient, type SDKClientConfig } from "./client";

// Error handling
export { FlowDBError, mapHttpError, mapNetworkError, type ErrorCode, type FlowDBErrorOptions } from "./errors";

// Retry utilities (useful for advanced scenarios)
export {
  retryWithBackoff,
  withTimeout,
  withTimeoutAndRetry,
  calculateBackoffDelay,
  sleep,
  type RetryOptions,
  DEFAULT_RETRY_OPTIONS
} from "./retry";

// Export all contract types
export type {
  BranchDto,
  BranchStatus,
  CreateBranchResponse,
  HealthResponse,
  ListBranchesResponse,
  OperationDto,
  OperationStatus,
  PaginationMeta
} from "./types";
