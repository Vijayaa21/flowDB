/**
 * FlowDB SDK - Main Client
 * Typed, retryable HTTP client for FlowDB orchestrator API
 */

import type {
  BranchDto,
  CreateBranchResponse,
  HealthResponse,
  ListBranchesResponse,
} from "./types";
import { FlowDBError, mapHttpError, mapNetworkError } from "./errors";
import { withTimeoutAndRetry, type RetryOptions } from "./retry";

export interface SDKClientConfig {
  apiUrl: string;
  apiKey: string;
  orgSlug: string;
  projectSlug: string;
  timeoutMs?: number;
  retryOptions?: Partial<RetryOptions>;
}

export class FlowDBClient {
  private readonly config: Required<SDKClientConfig>;

  public constructor(config: SDKClientConfig) {
    this.config = {
      apiUrl: config.apiUrl.endsWith("/") ? config.apiUrl.slice(0, -1) : config.apiUrl,
      apiKey: config.apiKey,
      orgSlug: config.orgSlug,
      projectSlug: config.projectSlug,
      timeoutMs: config.timeoutMs ?? 30000,
      retryOptions: config.retryOptions ?? {},
    };
  }

  private getAuthHeader(): string {
    return `Api-Key ${this.config.apiKey}`;
  }

  private getTenantHeaders(): Record<string, string> {
    return {
      "x-org-slug": this.config.orgSlug,
      "x-project-slug": this.config.projectSlug,
    };
  }

  private async request<T>(options: {
    method: string;
    endpoint: string;
    body?: unknown;
  }): Promise<T> {
    return withTimeoutAndRetry(
      async () => {
        const url = `${this.config.apiUrl}${options.endpoint}`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          ...this.getTenantHeaders(),
        };

        try {
          const response = await fetch(url, {
            method: options.method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
          });

          if (!response.ok) {
            const body = await response.text();
            throw mapHttpError(response.status, body);
          }

          return response.json() as Promise<T>;
        } catch (error) {
          if (error instanceof FlowDBError) {
            throw error;
          }

          if (error instanceof Error) {
            throw mapNetworkError(error);
          }

          throw new FlowDBError({
            code: "UNKNOWN",
            message: "An unknown error occurred",
            originalError: error instanceof Error ? error : undefined,
          });
        }
      },
      this.config.timeoutMs,
      this.config.retryOptions
    );
  }

  public async health(): Promise<HealthResponse> {
    const url = this.config.apiUrl.endsWith("/")
      ? this.config.apiUrl.slice(0, -1)
      : this.config.apiUrl;
    try {
      const response = await fetch(`${url}/health`);
      if (!response.ok) {
        throw mapHttpError(response.status, response.statusText);
      }
      return response.json() as Promise<HealthResponse>;
    } catch (error) {
      if (error instanceof FlowDBError) {
        throw error;
      }
      throw mapNetworkError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async listBranches(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListBranchesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const endpoint = `/branches${params.toString() ? `?${params.toString()}` : ""}`;
    return this.request<ListBranchesResponse>({ method: "GET", endpoint });
  }

  public async getBranch(branchName: string): Promise<BranchDto> {
    return this.request<BranchDto>({
      method: "GET",
      endpoint: `/branches/${encodeURIComponent(branchName)}`,
    });
  }

  public async createBranch(options: {
    branchName: string;
    idempotencyKey: string;
    sourceDatabaseUrl?: string;
  }): Promise<CreateBranchResponse> {
    return this.request<CreateBranchResponse>({
      method: "POST",
      endpoint: "/branches",
      body: {
        branchName: options.branchName,
        idempotencyKey: options.idempotencyKey,
        sourceDatabaseUrl: options.sourceDatabaseUrl,
      },
    });
  }

  public async deleteBranch(branchName: string): Promise<void> {
    await this.request<void>({
      method: "DELETE",
      endpoint: `/branches/${encodeURIComponent(branchName)}`,
    });
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): FlowDBClient {
    const apiUrl = env.FLOWDB_API_URL;
    const apiKey = env.FLOWDB_API_KEY;
    const orgSlug = env.FLOWDB_ORG_SLUG;
    const projectSlug = env.FLOWDB_PROJECT_SLUG;

    if (!apiUrl || !apiKey || !orgSlug || !projectSlug) {
      const missing = [];
      if (!apiUrl) missing.push("FLOWDB_API_URL");
      if (!apiKey) missing.push("FLOWDB_API_KEY");
      if (!orgSlug) missing.push("FLOWDB_ORG_SLUG");
      if (!projectSlug) missing.push("FLOWDB_PROJECT_SLUG");

      throw new FlowDBError({
        code: "BAD_REQUEST",
        message: `Missing required environment variables: ${missing.join(", ")}`,
      });
    }

    const timeoutMs = env.FLOWDB_TIMEOUT_MS ? parseInt(env.FLOWDB_TIMEOUT_MS, 10) : undefined;
    return new FlowDBClient({ apiUrl, apiKey, orgSlug, projectSlug, timeoutMs });
  }
}
