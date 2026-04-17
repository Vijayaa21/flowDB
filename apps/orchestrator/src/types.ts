export type BranchStatus = "READY" | "MIGRATING" | "TORN_DOWN" | "ERROR";

export type BranchRecord = {
  id: string;
  branchName: string;
  sourceUrl: string;
  branchUrl: string;
  status: BranchStatus;
  ownerGithubId: string;
  createdAt: Date;
};
