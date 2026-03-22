"use client";

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Eye, FlaskConical, Search, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { BranchApiResponse, BranchRecord } from "@/lib/types";
import { useBranches, useReseedDemoBranches, useSeedBranch, useTeardownBranch } from "@/lib/queries";
import { inferMigrationCount, inferStorageSize } from "@/lib/view-model";

type SortOption = "newest" | "oldest" | "name";
type StatusFilter = "all" | "ready" | "migrating" | "conflict";

type SeedModalState = {
  branchName: string;
  sql: string;
};

type ConfirmDialogState = {
  branch: BranchRecord;
};

function formatRelativeTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return formatDistanceToNowStrict(date, { addSuffix: true });
}

function formatUpdatedSince(date: Date): string {
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}

export default function BranchesPage() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [seedModal, setSeedModal] = useState<SeedModalState | null>(null);
  const [confirmTeardown, setConfirmTeardown] = useState<ConfirmDialogState | null>(null);
  const [updatedNow, setUpdatedNow] = useState(new Date());
  const queryClient = useQueryClient();

  const { data, error, isLoading, isError, refetch, dataUpdatedAt } = useBranches();
  const teardown = useTeardownBranch();
  const seedMutation = useSeedBranch();
  const reseedMutation = useReseedDemoBranches();

  const rows = useMemo(() => {
    return (data?.branches ?? []).map((branch) => ({
      ...branch,
      migrationCount: inferMigrationCount(branch),
      storageSize: inferStorageSize(branch)
    }));
  }, [data]);

  const filteredRows = useMemo(() => {
    const bySearch = rows.filter((row) =>
      row.branchName.toLowerCase().includes(searchTerm.trim().toLowerCase())
    );

    const byStatus = bySearch.filter((row) => {
      if (statusFilter === "all") {
        return true;
      }
      if (statusFilter === "ready") {
        return row.status === "ready" || row.status === "active";
      }
      return row.status === statusFilter;
    });

    const sorted = [...byStatus].sort((a, b) => {
      if (sortBy === "name") {
        return a.branchName.localeCompare(b.branchName);
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (sortBy === "oldest") {
        return aTime - bTime;
      }
      return bTime - aTime;
    });

    return sorted;
  }, [rows, searchTerm, statusFilter, sortBy]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUpdatedNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setLastRefreshed(new Date());
    await refetch();
  }, [refetch]);

  const handleSeedSubmit = useCallback(async () => {
    if (!seedModal) {
      return;
    }

    if (!seedModal.sql.trim()) {
      toast.error("Seed SQL is required.");
      return;
    }

    try {
      await seedMutation.mutateAsync({
        name: seedModal.branchName,
        sql: seedModal.sql
      });
      toast.success(`Seed applied to ${seedModal.branchName}.`);
      setSeedModal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to seed branch.";
      toast.error(message);
    }
  }, [seedModal, seedMutation]);

  const handleConfirmTeardown = useCallback(async () => {
    if (!confirmTeardown) {
      return;
    }

    const previous = queryClient.getQueryData<BranchApiResponse>(["branches"]);
    queryClient.setQueryData<BranchApiResponse>(["branches"], (current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        branches: current.branches.filter((b) => b.branchName !== confirmTeardown.branch.branchName)
      };
    });

    setConfirmTeardown(null);

    try {
      await teardown.mutateAsync(confirmTeardown.branch.branchName);
      toast.success(`Teardown started for ${confirmTeardown.branch.branchName}.`);
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(["branches"], previous);
      }
      const message = err instanceof Error ? err.message : "Failed to teardown branch.";
      toast.error(message);
    }
  }, [confirmTeardown, queryClient, teardown]);

  const handleReseedDemoData = useCallback(async () => {
    try {
      const result = await reseedMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success(`Restored ${result.count} demo branches.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore demo branches.";
      toast.error(message);
    }
  }, [queryClient, reseedMutation]);

  const updatedReference = dataUpdatedAt ? new Date(dataUpdatedAt) : updatedNow;
  const errorMessage = error instanceof Error ? error.message : "Failed to load branches.";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Branch Databases"
        description="All active branch environments with migration and storage metadata."
        breadcrumb={["Dashboard", "Branches"]}
        lastRefreshed={lastRefreshed}
        onRefresh={handleRefresh}
      />

      {isLoading && (
        <Card className="border-gray-200 bg-white">
          <CardContent className="p-8">
            <p className="text-center text-gray-600">Loading branches...</p>
          </CardContent>
        </Card>
      )}
      {isError && (
        <Card className="border-gray-200 bg-white">
          <CardContent className="p-8">
            <p className="text-center text-red-600">{errorMessage}</p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && rows.length === 0 && <EmptyState />}
      {!isLoading && !isError && rows.length > 0 && (
        <Card className="border-gray-200 bg-white">
          <CardHeader className="border-b border-gray-200">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>All Branches ({filteredRows.length})</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReseedDemoData}
                  disabled={reseedMutation.isPending}
                >
                  {reseedMutation.isPending ? "Restoring..." : "Restore demo branches"}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Updated {formatUpdatedSince(updatedReference)}</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by branch name"
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">All Statuses</option>
                <option value="ready">Ready</option>
                <option value="migrating">Migrating</option>
                <option value="conflict">Conflict</option>
              </select>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-200 bg-gray-50">
                    <TableHead className="font-semibold text-gray-900">Branch Name</TableHead>
                    <TableHead className="font-semibold text-gray-900">Status</TableHead>
                    <TableHead className="font-semibold text-gray-900">Created At</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Migrations</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Storage</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.branchName} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <TableCell className="font-mono font-medium text-green-700">{row.branchName}</TableCell>
                      <TableCell>
                        <Badge variant={row.status}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{formatRelativeTime(row.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{row.migrationCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-gray-600">{row.storageSize}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/branches/${encodeURIComponent(row.branchName)}`}>
                            <Button type="button" variant="outline" size="sm" title="View diff">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Seed data"
                            onClick={() => setSeedModal({ branchName: row.branchName, sql: "" })}
                          >
                            <FlaskConical className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            title="Teardown"
                            onClick={() => setConfirmTeardown({ branch: row })}
                            disabled={teardown.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        No matching branches found for current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {seedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Seed data for {seedModal.branchName}</h2>
            <p className="mt-1 text-sm text-gray-600">Enter SQL statements to seed this branch database.</p>
            <textarea
              value={seedModal.sql}
              onChange={(event) => setSeedModal({ ...seedModal, sql: event.target.value })}
              className="mt-4 h-52 w-full rounded-md border border-gray-300 p-3 font-mono text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="INSERT INTO users (email) VALUES ('test@flowdb.dev');"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSeedModal(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSeedSubmit} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? "Seeding..." : "Run seed"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmTeardown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Confirm teardown</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will remove branch <span className="font-mono text-red-700">{confirmTeardown.branch.branchName}</span>.
              This action cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmTeardown(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleConfirmTeardown}>
                Confirm teardown
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
