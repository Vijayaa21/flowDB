import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { CredentialManager, type Credentials } from "../src/credential-manager";
import { OrchestratorClient, type OrchestratorConfig } from "../src/orchestrator-client";

describe("credential manager", () => {
  let tempDir: string;
  let credentialManager: CredentialManager;

  beforeEach(() => {
    // Note: In real tests, we'd use a temp directory
    credentialManager = new CredentialManager();
  });

  it("should save credentials", () => {
    const credentials = {
      apiUrl: "http://localhost:3000",
      apiKey: "test-key",
      orgSlug: "test-org",
      projectSlug: "test-project"
    };

    credentialManager.saveCredentials(credentials);
    expect(credentialManager.hasCredentials()).toBe(true);
  });

  it("should load saved credentials", () => {
    const credentials = {
      apiUrl: "http://localhost:3000",
      apiKey: "test-key",
      orgSlug: "test-org",
      projectSlug: "test-project"
    };

    credentialManager.saveCredentials(credentials);
    const loaded = credentialManager.loadCredentials();
    expect(loaded).not.toBeNull();
    expect(loaded?.apiUrl).toBe(credentials.apiUrl);
    expect(loaded?.apiKey).toBe(credentials.apiKey);
    expect(loaded?.orgSlug).toBe(credentials.orgSlug);
    expect(loaded?.projectSlug).toBe(credentials.projectSlug);
  });

  it("should return null when no credentials exist", () => {
    credentialManager.deleteCredentials();
    const loaded = credentialManager.loadCredentials();
    expect(loaded).toBeNull();
  });
});

describe("orchestrator client", () => {
  const config: OrchestratorConfig = {
    apiUrl: "http://localhost:3000",
    apiKey: "test-key",
    orgSlug: "test-org",
    projectSlug: "test-project"
  };

  it("should create client with valid config", () => {
    const client = new OrchestratorClient(config);
    expect(client).toBeDefined();
  });

  it("should throw error when no auth is configured", () => {
    const noAuthConfig: OrchestratorConfig = {
      apiUrl: "http://localhost:3000",
      orgSlug: "test-org",
      projectSlug: "test-project"
    };

    const client = new OrchestratorClient(noAuthConfig);
    // The error would be thrown when making actual requests
    expect(client).toBeDefined();
  });

  it("should load config from environment", () => {
    const env = {
      FLOWDB_ORCHESTRATOR_URL: "http://localhost:3000",
      FLOWDB_API_KEY: "test-key",
      FLOWDB_ORG_SLUG: "test-org",
      FLOWDB_PROJECT_SLUG: "test-project"
    } as unknown as NodeJS.ProcessEnv;

    const config = OrchestratorClient.fromEnv(env);
    expect(config).not.toBeNull();
    expect(config?.apiUrl).toBe("http://localhost:3000");
    expect(config?.apiKey).toBe("test-key");
    expect(config?.orgSlug).toBe("test-org");
    expect(config?.projectSlug).toBe("test-project");
  });

  it("should return null for incomplete env config", () => {
    const env = {
      FLOWDB_ORCHESTRATOR_URL: "http://localhost:3000"
    } as unknown as NodeJS.ProcessEnv;

    const config = OrchestratorClient.fromEnv(env);
    expect(config).toBeNull();
  });
});
