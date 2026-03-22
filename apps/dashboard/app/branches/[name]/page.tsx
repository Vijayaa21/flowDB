"use client";

import { useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import ReactDiffViewer from "react-diff-viewer-continued";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useBranchDetail, useTeardownBranch } from "@/lib/queries";
import type { BranchStatus } from "@/lib/types";

type NormalizedMigration = {
  id: string;
  filename: string;
  status: "applied" | "pending" | "failed";
  timestamp: string;
  sql: string;
};

type NormalizedConflict = {
  id: string;
  tableName: string;
  columnName: string;
  conflictType: string;
  resolutionSql: string;
};

function normalizeBranchStatus(status?: string): BranchStatus {
  if (!status) {
    return "ready";
  }
  if (status === "error") {
    return "conflict";
  }
  return status as BranchStatus;
}

function normalizeMigrationStatus(status?: string): "applied" | "pending" | "failed" {
  if (status === "applied" || status === "pending" || status === "failed") {
    return status;
  }
  if (status === "migrating") {
    return "pending";
  }
  if (status === "error" || status === "conflict") {
    return "failed";
  }
  return "applied";
}

function formatRelativeTimestamp(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export default function BranchDetailPage() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [expandedMigrations, setExpandedMigrations] = useState<Record<string, boolean>>({});
  const [expandedFixes, setExpandedFixes] = useState<Record<string, boolean>>({});
  const [splitView, setSplitView] = useState(true);
  const params = useParams<{ name: string }>();
  const branchName = decodeURIComponent(params.name ?? "unknown");
  const { data, isLoading, isError, refetch } = useBranchDetail(branchName);
  const teardown = useTeardownBranch();

  const branchStatus = normalizeBranchStatus(data?.branch?.status);

  const timeline = useMemo<NormalizedMigration[]>(() => {
    return (data?.migrationTimeline ?? []).map((item) => ({
      id: item.id,
      filename: item.filename,
      status: normalizeMigrationStatus(item.status),
      timestamp: item.timestamp,
      sql: item.sql ?? `-- SQL unavailable for ${item.filename}`
    }));
  }, [data]);

  const conflicts = useMemo<NormalizedConflict[]>(() => {
    return (data?.conflicts ?? []).map((item, index) => ({
      id: item.id ?? `${branchName}-conflict-${index + 1}`,
      tableName: item.tableName ?? item.target?.split(".")[0] ?? "unknown_table",
      columnName: item.columnName ?? item.target?.split(".")[1] ?? "unknown_column",
      conflictType: item.conflictType ?? item.hint ?? "Schema conflict detected",
      resolutionSql:
        item.resolutionSql ??
        `-- Resolve ${item.tableName ?? "table"}.${item.columnName ?? "column"}\n-- Replace with reconciled schema changes`
    }));
  }, [branchName, data]);

  const createdAtLabel = formatRelativeTimestamp(data?.branch?.createdAt);

  const toggleMigration = (id: string) => {
    setExpandedMigrations((current) => ({
      ...current,
      [id]: !current[id]
    }));
  };

  const toggleFix = (id: string) => {
    setExpandedFixes((current) => ({
      ...current,
      [id]: !current[id]
    }));
  };

  const handleCopySql = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      toast.success("SQL copied to clipboard.");
    } catch {
      toast.error("Failed to copy SQL.");
    }
  };

  const handleTeardown = async () => {
    const confirmed = window.confirm(`Teardown branch ${branchName}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await teardown.mutateAsync(branchName);
      toast.success(`Teardown started for ${branchName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to teardown branch.";
      toast.error(message);
    }
  };

  const handleRefresh = useCallback(async () => {
    setLastRefreshed(new Date());
    await refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Branch: ${branchName}`}
        description="Migration execution timeline, schema diff, and conflict diagnostics."
        breadcrumb={["Dashboard", "Branches", branchName]}
        lastRefreshed={lastRefreshed}
        onRefresh={handleRefresh}
      />

      {isLoading && (
        <Card className="border-gray-200 bg-white">
          <CardContent className="p-8">
            <p className="text-center text-gray-600">Loading branch details...</p>
          </CardContent>
        </Card>
      )}
      {isError && (
        <Card className="border-gray-200 bg-white">
          <CardContent className="p-8">
            <p className="text-center text-red-600">Unable to load branch detail from orchestrator.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && (
        <>
          <section>
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <h2 className="font-mono text-3xl font-bold text-green-700">{branchName}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <Badge variant={branchStatus} className="capitalize">
                        {branchStatus === "migrating" && (
                          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                        )}
                        {branchStatus}
                      </Badge>
                      <span className="rounded-md bg-gray-100 px-2 py-1">Fork of main</span>
                      <span>Created {createdAtLabel}</span>
                    </div>
                  </div>
                  <Button type="button" variant="destructive" onClick={handleTeardown} disabled={teardown.isPending}>
                    {teardown.isPending ? "Tearing down..." : "Teardown branch"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Migration Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                {timeline.length === 0 && (
                  <p className="text-center text-gray-600 py-4">No migration history available.</p>
                )}
                {timeline.map((item) => (
                  <div key={item.id} className="relative pl-7">
                    <div className="absolute left-[11px] top-0 h-full w-px bg-gray-200" />
                    <div
                      className={`absolute left-0 top-2 h-5 w-5 rounded-full border-2 ${
                        item.status === "applied"
                          ? "border-green-500 bg-green-100"
                          : item.status === "pending"
                            ? "border-amber-500 bg-amber-100"
                            : "border-red-500 bg-red-100"
                      }`}
                    />
                    <div
                      className={`rounded-lg bg-gray-50 p-4 transition-colors ${
                        item.status === "pending" ? "border border-dashed border-amber-300" : "border border-gray-200"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left"
                        onClick={() => toggleMigration(item.id)}
                      >
                        <span className="font-medium text-gray-900">{item.filename}</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              item.status === "applied"
                                ? "ready"
                                : item.status === "pending"
                                  ? "migrating"
                                  : "conflict"
                            }
                            className="capitalize"
                          >
                            {item.status}
                          </Badge>
                          {expandedMigrations[item.id] ? (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                      <p className="mt-2 text-sm text-gray-600">Applied {formatRelativeTimestamp(item.timestamp)}</p>
                      {expandedMigrations[item.id] && (
                        <pre className="mt-3 overflow-auto rounded-md border border-gray-200 bg-gray-900 p-3 font-mono text-xs text-gray-100">
                          {item.sql}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Schema Diff Viewer</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setSplitView((value) => !value)}>
                  {splitView ? "Unified view" : "Split view"}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <ReactDiffViewer
                    oldValue={data.schemaDiff.mainSql}
                    newValue={data.schemaDiff.branchSql}
                    splitView={splitView}
                    leftTitle="main"
                    rightTitle={branchName}
                    useDarkTheme={false}
                    styles={{
                      variables: {
                        light: {
                          diffViewerBackground: "#ffffff",
                          addedBackground: "#ecfdf3",
                          removedBackground: "#fef2f2",
                          addedColor: "#14532d",
                          removedColor: "#7f1d1d",
                          wordAddedBackground: "#bbf7d0",
                          wordRemovedBackground: "#fecaca"
                        }
                      },
                      contentText: {
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                        fontSize: "12px"
                      },
                      lineNumber: {
                        minWidth: "40px"
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {branchStatus === "conflict" && (
            <section>
              <Card className="border-red-300 bg-white">
                <CardHeader className="border-b border-red-200 bg-red-50">
                  <div className="rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-900">
                    Conflict detected. Manual reconciliation is required before merge.
                  </div>
                  <CardTitle className="text-lg text-red-900">Detected Conflicts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  {conflicts.length === 0 && (
                    <p className="text-sm text-red-700">No conflict details were provided by orchestrator.</p>
                  )}
                  {conflicts.map((conflict) => (
                    <div key={conflict.id} className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="font-medium text-red-900">
                        {conflict.tableName}.{conflict.columnName}
                      </p>
                      <p className="mt-1 text-sm text-red-800">{conflict.conflictType}</p>

                      <button
                        type="button"
                        className="mt-3 flex items-center gap-1 text-sm font-medium text-red-900"
                        onClick={() => toggleFix(conflict.id)}
                      >
                        {expandedFixes[conflict.id] ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        How to fix
                      </button>

                      {expandedFixes[conflict.id] && (
                        <div className="mt-3 space-y-2">
                          <pre className="overflow-auto rounded-md border border-red-200 bg-red-950 p-3 font-mono text-xs text-red-100">
                            {conflict.resolutionSql}
                          </pre>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopySql(conflict.resolutionSql)}
                          >
                            Copy SQL
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
