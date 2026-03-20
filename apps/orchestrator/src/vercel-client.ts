import * as VercelSdk from "@vercel/sdk";

export type VercelClient = {
  injectDeploymentDatabaseUrl(deploymentId: string, databaseUrl: string): Promise<void>;
};

export class VercelSdkClient implements VercelClient {
  private readonly client: any;

  public constructor(apiToken: string) {
    const SdkClass = (VercelSdk as any).Vercel ?? (VercelSdk as any).default;
    if (!SdkClass) {
      throw new Error("Vercel SDK class not found.");
    }
    this.client = new SdkClass({ bearerToken: apiToken });
  }

  public async injectDeploymentDatabaseUrl(deploymentId: string, databaseUrl: string): Promise<void> {
    if (this.client.deployments?.createDeploymentEnv) {
      await this.client.deployments.createDeploymentEnv({
        id: deploymentId,
        requestBody: {
          key: "DATABASE_URL",
          value: databaseUrl,
          type: "plain"
        }
      });
      return;
    }

    if (this.client.deployments?.updateDeployment) {
      await this.client.deployments.updateDeployment({
        id: deploymentId,
        requestBody: {
          env: {
            DATABASE_URL: databaseUrl
          }
        }
      });
      return;
    }

    throw new Error("No supported deployment environment injection method found in @vercel/sdk.");
  }
}