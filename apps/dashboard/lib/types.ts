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
  branch?: {
    branchName: string;
    status: BranchStatus;
    createdAt?: string;
    forkOf?: string;
  };
  migrationTimeline: Array<{
    id: string;
    filename: string;
    status: "applied" | "pending" | "failed" | BranchStatus;
    timestamp: string;
    sql?: string;
  }>;
  schemaDiff: {
    mainSql: string;
    branchSql: string;
  };
  conflicts: Array<{
    id: string;
    target?: string;
    hint?: string;
    tableName?: string;
    columnName?: string;
    conflictType?: string;
    resolutionSql?: string;
  }>;
};
