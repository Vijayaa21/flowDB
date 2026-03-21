import { Octokit } from "@octokit/rest";

import type { MigrationConflict } from "./migration-runner";

const FLOWDB_COMMENT_MARKER = "<!-- flowdb:reconcile-comment -->";

export type ReconcileCommentData = {
  branchName: string;
  branchDbStatus: string;
  pendingMigrations: string[];
  schemaDiffSummary: string;
  conflicts: MigrationConflict[];
};

export type GithubCommentPublisher = {
  upsertReconcileComment(params: {
    owner: string;
    repo: string;
    branchName: string;
    data: ReconcileCommentData;
  }): Promise<void>;
};

export function renderReconcileCommentMarkdown(data: ReconcileCommentData): string {
  const pendingMigrationsBlock =
    data.pendingMigrations.length > 0
      ? data.pendingMigrations.map((migration) => `- ${migration}`).join("\n")
      : "- None";

  const conflictWarningBlock =
    data.conflicts.length > 0
      ? [
          "\n## Conflict Warning",
          "",
          "> [!WARNING]",
          "> Conflicts were detected while reconciling this branch with main.",
          ...data.conflicts.map((conflict) => `> - ${conflict.table}.${conflict.column}`)
        ].join("\n")
      : "";

  return [
    FLOWDB_COMMENT_MARKER,
    "## FlowDB Reconciliation Report",
    "",
    `- Branch: ${data.branchName}`,
    `- Branch DB Status: ${data.branchDbStatus}`,
    "",
    "## Pending Migrations",
    "",
    pendingMigrationsBlock,
    "",
    "## Schema Diff Summary",
    "",
    data.schemaDiffSummary,
    conflictWarningBlock,
    ""
  ].join("\n");
}

export class NoopGithubCommentPublisher implements GithubCommentPublisher {
  public async upsertReconcileComment(): Promise<void> {
    return;
  }
}

export class OctokitGithubCommentPublisher implements GithubCommentPublisher {
  private readonly octokit: Octokit;

  public constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  public async upsertReconcileComment(params: {
    owner: string;
    repo: string;
    branchName: string;
    data: ReconcileCommentData;
  }): Promise<void> {
    const pullRequests = await this.octokit.pulls.list({
      owner: params.owner,
      repo: params.repo,
      state: "open",
      head: `${params.owner}:${params.branchName}`,
      per_page: 1
    });

    const pullRequest = pullRequests.data[0];
    if (!pullRequest) {
      return;
    }

    const body = renderReconcileCommentMarkdown(params.data);
    const comments = await this.octokit.issues.listComments({
      owner: params.owner,
      repo: params.repo,
      issue_number: pullRequest.number,
      per_page: 100
    });

    const existing = comments.data.find((comment) => comment.body?.includes(FLOWDB_COMMENT_MARKER));

    if (existing) {
      await this.octokit.issues.updateComment({
        owner: params.owner,
        repo: params.repo,
        comment_id: existing.id,
        body
      });
      return;
    }

    await this.octokit.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: pullRequest.number,
      body
    });
  }
}