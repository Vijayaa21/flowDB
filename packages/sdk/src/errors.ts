/**
 * FlowDB SDK Error Classes
 * Provides typed error handling and mapping for SDK operations
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface FlowDBErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  originalError?: Error;
  retryable?: boolean;
}

/**
 * Base error class for FlowDB SDK operations
 */
export class FlowDBError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode?: number;
  public readonly originalError?: Error;
  public readonly retryable: boolean;

  public constructor(options: FlowDBErrorOptions) {
    super(options.message);
    this.name = "FlowDBError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.originalError = options.originalError;
    this.retryable = options.retryable ?? this.isRetryable(options.code);
    Object.setPrototypeOf(this, FlowDBError.prototype);
  }

  private isRetryable(code: ErrorCode): boolean {
    // These errors are retryable
    return ["RATE_LIMITED", "TIMEOUT", "NETWORK_ERROR", "INTERNAL_ERROR"].includes(code);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable
    };
  }
}

/**
 * Map HTTP status codes and response bodies to FlowDB errors
 */
export function mapHttpError(
  statusCode: number,
  body: string,
  originalError?: Error
): FlowDBError {
  let code: ErrorCode = "INTERNAL_ERROR";
  let message = body || "Unknown error";

  switch (statusCode) {
    case 400:
      code = "BAD_REQUEST";
      break;
    case 401:
      code = "UNAUTHORIZED";
      break;
    case 403:
      code = "FORBIDDEN";
      break;
    case 404:
      code = "NOT_FOUND";
      break;
    case 409:
      code = "CONFLICT";
      break;
    case 429:
      code = "RATE_LIMITED";
      break;
    case 500:
    case 502:
    case 503:
      code = "INTERNAL_ERROR";
      break;
    case 504:
      code = "TIMEOUT";
      break;
    default:
      if (statusCode >= 500) {
        code = "INTERNAL_ERROR";
      }
  }

  return new FlowDBError({
    code,
    message: `HTTP ${statusCode}: ${message}`,
    statusCode,
    originalError
  });
}

/**
 * Map network errors to FlowDB errors
 */
export function mapNetworkError(error: Error): FlowDBError {
  return new FlowDBError({
    code: "NETWORK_ERROR",
    message: `Network error: ${error.message}`,
    originalError: error,
    retryable: true
  });
}
