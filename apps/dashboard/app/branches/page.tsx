"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { data, isLoading, isError } = useBranches();
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

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Branch Databases</h1>
        <p className="text-sm text-muted-foreground">
          All active branch environments with migration and storage metadata.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>All Branches</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading branches...</p>}
          {isError && <p className="text-sm text-destructive">Failed to load branches.</p>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Migrations</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.branchName}>
                      <TableCell className="font-medium">{row.branchName}</TableCell>
                      <TableCell>
                        <Badge variant={row.status}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.createdLabel}</TableCell>
                      <TableCell>{row.ageLabel}</TableCell>
                      <TableCell>{row.migrationCount}</TableCell>
                      <TableCell>{row.storageSize}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => teardown.mutate(row.branchName)}
                          disabled={teardown.isPending}
                        >
                          Teardown
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
