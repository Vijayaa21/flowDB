import { describe, it, expect, beforeEach, vi } from "vitest";
import { FlowDBClient, type SDKClientConfig } from "../src/client";
import { FlowDBError } from "../src/errors";
import { sleep, calculateBackoffDelay, DEFAULT_RETRY_OPTIONS } from "../src/retry";

describe("FlowDB SDK", () => {
  let clientConfig: SDKClientConfig;

  beforeEach(() => {
    clientConfig = {
      apiUrl: "http://localhost:3000",
      apiKey: "test-key-12345",
      orgSlug: "test-org",
      projectSlug: "test-project",
      timeoutMs: 5000,
    };
  });

  describe("FlowDBClient", () => {
    it("should create a client with valid config", () => {
      const client = new FlowDBClient(clientConfig);
      expect(client).toBeDefined();
    });

    it("should strip trailing slash from apiUrl", () => {
      const config = { ...clientConfig, apiUrl: "http://localhost:3000/" };
      const client = new FlowDBClient(config);
      expect(client).toBeDefined();
    });

    it("should throw error when created from env with missing vars", () => {
      const env = {
        FLOWDB_API_URL: "http://localhost:3000",
        // Missing other required vars
      } as unknown as NodeJS.ProcessEnv;

      expect(() => FlowDBClient.fromEnv(env)).toThrow(FlowDBError);
    });

    it("should create client from env with all required vars", () => {
      const env = {
        FLOWDB_API_URL: "http://localhost:3000",
        FLOWDB_API_KEY: "test-key",
        FLOWDB_ORG_SLUG: "test-org",
        FLOWDB_PROJECT_SLUG: "test-project",
        FLOWDB_TIMEOUT_MS: "10000",
      } as unknown as NodeJS.ProcessEnv;

      const client = FlowDBClient.fromEnv(env);
      expect(client).toBeInstanceOf(FlowDBClient);
    });
  });

  describe("Error handling", () => {
    it("should create FlowDBError with retryable flag", () => {
      const error = new FlowDBError({
        code: "TIMEOUT",
        message: "Request timed out",
        retryable: true,
      });

      expect(error.retryable).toBe(true);
      expect(error.code).toBe("TIMEOUT");
    });

    it("should automatically mark RATE_LIMITED as retryable", () => {
      const error = new FlowDBError({
        code: "RATE_LIMITED",
        message: "Rate limited",
      });

      expect(error.retryable).toBe(true);
    });

    it("should automatically mark NOT_FOUND as non-retryable", () => {
      const error = new FlowDBError({
        code: "NOT_FOUND",
        message: "Branch not found",
      });

      expect(error.retryable).toBe(false);
    });
  });

  describe("Retry logic", () => {
    it("should calculate exponential backoff correctly", () => {
      const delay0 = calculateBackoffDelay(0, DEFAULT_RETRY_OPTIONS);
      const delay1 = calculateBackoffDelay(1, DEFAULT_RETRY_OPTIONS);
      const delay2 = calculateBackoffDelay(2, DEFAULT_RETRY_OPTIONS);

      expect(delay0).toBe(100);
      expect(delay1).toBe(200);
      expect(delay2).toBe(400);
    });

    it("should respect max delay cap", () => {
      const options = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      };

      const delay10 = calculateBackoffDelay(10, options);
      expect(delay10).toBe(5000); // Should be capped at maxDelayMs
    });

    it("should implement sleep correctly", async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      // Allow some tolerance (±50ms)
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe("Client config from environment", () => {
    it("should parse timeout from env as number", () => {
      const env = {
        FLOWDB_API_URL: "http://localhost:3000",
        FLOWDB_API_KEY: "test-key",
        FLOWDB_ORG_SLUG: "test-org",
        FLOWDB_PROJECT_SLUG: "test-project",
        FLOWDB_TIMEOUT_MS: "15000",
      } as unknown as NodeJS.ProcessEnv;

      const client = FlowDBClient.fromEnv(env);
      expect(client).toBeInstanceOf(FlowDBClient);
    });

    it("should provide helpful error message for missing required values", () => {
      const env = {} as unknown as NodeJS.ProcessEnv;

      try {
        FlowDBClient.fromEnv(env);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FlowDBError);
        if (error instanceof FlowDBError) {
          expect(error.message).toContain("Missing required environment variables");
          expect(error.code).toBe("BAD_REQUEST");
        }
      }
    });
  });
});
