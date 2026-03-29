import path from "node:path";
import fs from "node:fs";
import { homedir } from "node:os";

export type Credentials = {
  apiUrl: string;
  apiKey?: string;
  jwtToken?: string;
  orgSlug: string;
  projectSlug: string;
  updatedAt: string;
};

export class CredentialManager {
  private readonly configDir = path.join(homedir(), ".flowdb");
  private readonly credentialsFile = path.join(this.configDir, "credentials.json");

  public ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  public saveCredentials(credentials: Omit<Credentials, "updatedAt">): void {
    this.ensureConfigDir();
    const data: Credentials = {
      ...credentials,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(this.credentialsFile, JSON.stringify(data, null, 2));
  }

  public loadCredentials(): Credentials | null {
    if (!fs.existsSync(this.credentialsFile)) {
      return null;
    }
    try {
      const data = fs.readFileSync(this.credentialsFile, "utf-8");
      return JSON.parse(data) as Credentials;
    } catch {
      return null;
    }
  }

  public hasCredentials(): boolean {
    return fs.existsSync(this.credentialsFile);
  }

  public deleteCredentials(): void {
    if (fs.existsSync(this.credentialsFile)) {
      fs.unlinkSync(this.credentialsFile);
    }
  }
}
