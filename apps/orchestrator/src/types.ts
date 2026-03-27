export type BranchStatus = "active" | "migrating" | "closed" | "error";

export type BranchRecord = {
  prNumber: number;
  branchName: string;
  branchDatabaseUrl: string;
  status: BranchStatus;
  createdAt: Date;
  updatedAt: Date;
};