import { marked } from "marked";
import { describe, expect, test } from "vitest";

import { renderReconcileCommentMarkdown } from "../src/github-pr-comments";

describe("renderReconcileCommentMarkdown", () => {
  test("renders valid markdown for reconciliation report", async () => {
    const markdown = renderReconcileCommentMarkdown({
      branchName: "feature/integration",
      branchDbStatus: "active",
      pendingMigrations: ["prisma/migrations/202601010001_init/migration.sql"],
      schemaDiffSummary: "Applied 1 of 1 pending migration(s).",
      conflicts: [{ table: "users", column: "email" }]
    });

    const html = await marked.parse(markdown);

    expect(markdown).toContain("## FlowDB Reconciliation Report");
    expect(markdown).toContain("## Conflict Warning");
    expect(html).toContain("<h2");
    expect(html).toContain("FlowDB Reconciliation Report");
  });
});
