export type BranchStatus = "ready" | "active" | "migrating" | "conflict" | "error" | "closed";

export type BranchRecord = {
  branchName: string;
  status: BranchStatus;
  createdAt?: string;
  updatedAt?: string;
  migrationCount?: number;
  storageSize?: string;
};

export type BranchApiResponse = {
  branches: BranchRecord[];
};

export type BranchDetailApiResponse = {
  migrationTimeline: Array<{
    id: string;
    filename: string;
    status: BranchStatus;
    timestamp: string;
  }>;
  schemaDiff: {
    mainSql: string;
    branchSql: string;
  };
  conflicts: Array<{
    id: string;
    target: string;
    hint: string;
  }>;
};
