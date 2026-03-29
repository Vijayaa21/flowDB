export interface ForkResult {
  branchDatabaseUrl: string;
  branchName: string;
  forkedAt: Date;
  durationMs: number;
}

export interface BranchInfo {
  name: string;
  size: number;
  createdAt: Date;
}
