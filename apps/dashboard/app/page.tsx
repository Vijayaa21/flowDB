"use client";

import { AlertTriangle, Database, GitMerge } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranches } from "@/lib/queries";

export default function OverviewPage() {
  const { data, isLoading, isError } = useBranches();
  const branches = data?.branches ?? [];

  const totalBranches = branches.length;
  const activeMigrations = branches.filter((branch) => branch.status === "migrating").length;
  const conflictAlerts = branches.filter((branch) => branch.status === "conflict").length;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Live operational snapshot sourced from orchestrator branch telemetry.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Branches"
          value={String(totalBranches)}
          icon={<Database className="h-4 w-4" />}
          tone="ready"
        />
        <StatCard
          title="Active Migrations"
          value={String(activeMigrations)}
          icon={<GitMerge className="h-4 w-4" />}
          tone="migrating"
        />
        <StatCard
          title="Conflict Alerts"
          value={String(conflictAlerts)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="conflict"
        />
      </section>

      <section>
        <Card className="border-border/70 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Branch Health Feed
              <Badge variant="outline">refresh: 30s</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading && <p className="text-muted-foreground">Loading branch telemetry...</p>}
            {isError && <p className="text-destructive">Unable to load orchestrator data.</p>}
            {!isLoading && !isError && branches.length === 0 && (
              <p className="text-muted-foreground">No branch records found.</p>
            )}
            {branches.slice(0, 5).map((branch) => (
              <div key={branch.branchName} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium">{branch.branchName}</span>
                <Badge variant={branch.status}>{branch.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}