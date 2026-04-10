import type { ListBranchesResponse, CreateBranchResponse, BranchDto } from "@flowdb/orchestrator";

export type OrchestratorConfig = {
  apiUrl: string;
  apiKey?: string;
  jwtToken?: string;
  orgSlug: string;
  projectSlug: string;
};

export class OrchestratorClient {
  private readonly config: OrchestratorConfig;

  public constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  private getAuthHeader(): string {
    if (this.config.apiKey) {
      return `Api-Key ${this.config.apiKey}`;
    }
    if (this.config.jwtToken) {
      return `Bearer ${this.config.jwtToken}`;
    }
    throw new Error("No authentication configured. Run 'flowdb login' first.");
  }

  private getTenantHeaders(): Record<string, string> {
    return {
      "x-org-slug": this.config.orgSlug,
      "x-project-slug": this.config.projectSlug,
    };
  }

  private async makeRequest<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const apiUrl = this.config.apiUrl.endsWith("/")
      ? this.config.apiUrl.slice(0, -1)
      : this.config.apiUrl;

    const url = `${apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.getTenantHeaders(),
    };

    if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
    } else if (this.config.jwtToken) {
      headers["Authorization"] = `Bearer ${this.config.jwtToken}`;
    } else {
      throw new Error("No authentication configured");
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Orchestrator error (${response.status}): ${errorBody || response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  public async health(): Promise<{ status: string; version: string; timestamp: string }> {
    const url = this.config.apiUrl.endsWith("/")
      ? this.config.apiUrl.slice(0, -1)
      : this.config.apiUrl;

    const response = await fetch(`${url}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json() as Promise<{ status: string; version: string; timestamp: string }>;
  }

  public async listBranches(limit = 25, cursor?: string): Promise<ListBranchesResponse> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (cursor) {
      params.set("cursor", cursor);
    }

    const apiUrl = this.config.apiUrl.endsWith("/")
      ? this.config.apiUrl.slice(0, -1)
      : this.config.apiUrl;

    const url = `${apiUrl}/branches?${params.toString()}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.getTenantHeaders(),
    };

    if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
    } else if (this.config.jwtToken) {
      headers["Authorization"] = `Bearer ${this.config.jwtToken}`;
    } else {
      throw new Error("No authentication configured");
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to list branches: ${response.statusText}`);
    }

    return response.json() as Promise<ListBranchesResponse>;
  }

  public async createBranch(
    branchName: string,
    idempotencyKey: string,
    sourceDatabaseUrl?: string
  ): Promise<CreateBranchResponse> {
    return this.makeRequest<CreateBranchResponse>("POST", "/branches", {
      branchName,
      idempotencyKey,
      sourceDatabaseUrl,
    });
  }

  public async deleteBranch(branchName: string): Promise<void> {
    await this.makeRequest<void>("DELETE", `/branches/${encodeURIComponent(branchName)}`);
  }

  public static fromEnv(env: NodeJS.ProcessEnv): OrchestratorConfig | null {
    const apiUrl = env.FLOWDB_ORCHESTRATOR_URL;
    const orgSlug = env.FLOWDB_ORG_SLUG;
    const projectSlug = env.FLOWDB_PROJECT_SLUG;
    const apiKey = env.FLOWDB_API_KEY;
    const jwtToken = env.FLOWDB_JWT_TOKEN;

    if (!apiUrl || !orgSlug || !projectSlug) {
      return null;
    }

    return {
      apiUrl,
      apiKey,
      jwtToken,
      orgSlug,
      projectSlug,
    };
  }
}
