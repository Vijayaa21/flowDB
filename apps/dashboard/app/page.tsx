"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, Database, GitMerge } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useBranches } from "@/lib/queries";

export default function OverviewPage() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const { data, isLoading, isError, refetch } = useBranches();
  const branches = data?.branches ?? [];

  const totalBranches = branches.length;
  const activeMigrations = branches.filter((branch) => branch.status === "migrating").length;
  const conflictAlerts = branches.filter((branch) => branch.status === "conflict").length;

  const handleRefresh = useCallback(async () => {
    setLastRefreshed(new Date());
    await refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Live operational snapshot sourced from orchestrator branch telemetry."
        breadcrumb={["Dashboard", "Overview"]}
        lastRefreshed={lastRefreshed}
        onRefresh={handleRefresh}
      />

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Branches"
          value={String(totalBranches)}
          icon={<Database className="h-6 w-6" />}
          tone="ready"
          trend={{ value: "+2 since last hour", direction: "up" }}
        />
        <StatCard
          title="Active Migrations"
          value={String(activeMigrations)}
          icon={<GitMerge className="h-6 w-6" />}
          tone="migrating"
          trend={{ value: "currently in progress", direction: "neutral" }}
        />
        <StatCard
          title="Conflict Alerts"
          value={String(conflictAlerts)}
          icon={<AlertTriangle className="h-6 w-6" />}
          tone="conflict"
          trend={{ value: "-1 since yesterday", direction: "down" }}
        />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-gray-900">Branch Health Feed</h2>
        {isLoading && (
          <Card className="border-gray-200 bg-white">
            <CardContent className="p-8">
              <p className="text-center text-gray-600">Loading branch telemetry...</p>
            </CardContent>
          </Card>
        )}
        {isError && (
          <Card className="border-gray-200 bg-white">
            <CardContent className="p-8">
              <p className="text-center text-red-600">Unable to load orchestrator data.</p>
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && branches.length === 0 && <EmptyState />}
        {branches.length > 0 && (
          <Card className="border-gray-200 bg-white">
            <CardContent className="p-6 space-y-3">
              {branches.slice(0, 5).map((branch) => (
                <div key={branch.branchName} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{branch.branchName}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Created {new Date(branch.createdAt ?? "").toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={branch.status}>{branch.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}