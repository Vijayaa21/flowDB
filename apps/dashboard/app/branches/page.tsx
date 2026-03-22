"use client";

import { useMemo, useState, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useBranches, useTeardownBranch } from "@/lib/queries";
import { formatDateTime, getBranchAge, inferMigrationCount, inferStorageSize } from "@/lib/view-model";

export default function BranchesPage() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const { data, isLoading, isError, refetch } = useBranches();
  const teardown = useTeardownBranch();

  const rows = useMemo(() => {
    return (data?.branches ?? []).map((branch) => ({
      ...branch,
      migrationCount: inferMigrationCount(branch),
      storageSize: inferStorageSize(branch),
      createdLabel: formatDateTime(branch.createdAt),
      ageLabel: getBranchAge(branch.createdAt)
    }));
  }, [data]);

  const handleRefresh = useCallback(async () => {
    setLastRefreshed(new Date());
    await refetch();
  }, [refetch]);

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
            <p className="text-center text-red-600">Failed to load branches.</p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && rows.length === 0 && <EmptyState />}
      {!isLoading && !isError && rows.length > 0 && (
        <Card className="border-gray-200 bg-white">
          <CardHeader className="border-b border-gray-200">
            <CardTitle>All Branches ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-200 bg-gray-50">
                    <TableHead className="font-semibold text-gray-900">Name</TableHead>
                    <TableHead className="font-semibold text-gray-900">Status</TableHead>
                    <TableHead className="font-semibold text-gray-900">Created</TableHead>
                    <TableHead className="font-semibold text-gray-900">Age</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Migrations</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Storage</TableHead>
                    <TableHead className="text-right font-semibold text-gray-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.branchName} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <TableCell className="font-medium text-gray-900">{row.branchName}</TableCell>
                      <TableCell>
                        <Badge variant={row.status}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{row.createdLabel}</TableCell>
                      <TableCell className="text-gray-600">{row.ageLabel}</TableCell>
                      <TableCell className="text-right text-gray-600">{row.migrationCount}</TableCell>
                      <TableCell className="text-right text-gray-600">{row.storageSize}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => teardown.mutate(row.branchName)}
                          disabled={teardown.isPending}
                          className="text-white"
                        >
                          Teardown
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
