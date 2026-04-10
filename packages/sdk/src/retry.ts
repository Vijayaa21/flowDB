/**
 * Retry and timeout utilities for the FlowDB SDK
 */

import { FlowDBError } from "./errors";

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate next retry delay with exponential backoff
 */
export function calculateBackoffDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(exponentialDelay, options.maxDelayMs);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const mergedOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= mergedOptions.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable =
        error instanceof FlowDBError
          ? error.retryable
          : error instanceof Error && error.message.includes("Network");

      if (!isRetryable || attempt === mergedOptions.maxRetries) {
        throw error;
      }

      // Calculate delay and sleep
      const delay = calculateBackoffDelay(attempt, mergedOptions);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper for promises
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new FlowDBError({
              code: "TIMEOUT",
              message: `Operation timed out after ${timeoutMs}ms`,
              retryable: true,
            })
          ),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Combine timeout and retry logic
 */
export async function withTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions?: Partial<RetryOptions>
): Promise<T> {
  return retryWithBackoff(() => withTimeout(fn(), timeoutMs), retryOptions);
}
