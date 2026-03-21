"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranchDetail } from "@/lib/queries";

export default function BranchDetailPage() {
  const params = useParams<{ name: string }>();
  const branchName = decodeURIComponent(params.name ?? "unknown");
  const { data, isLoading, isError } = useBranchDetail(branchName);

  const timeline = useMemo(() => data?.migrationTimeline ?? [], [data]);
  const conflicts = useMemo(() => data?.conflicts ?? [], [data]);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Branch Detail: {branchName}</h1>
        <p className="text-sm text-muted-foreground">
          Migration execution timeline, schema diff, and conflict diagnostics.
        </p>
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Loading branch details...</p>}
      {isError && <p className="text-sm text-destructive">Unable to load branch detail from orchestrator.</p>}

      {!isLoading && !isError && data && (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Migration Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {timeline.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.filename}</span>
                      <Badge variant={item.status}>{item.status}</Badge>
                    </div>
                    <p className="mt-2 text-muted-foreground">{item.timestamp}</p>
                  </div>
                ))}
                {timeline.length === 0 && <p className="text-muted-foreground">No migration history available.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conflict List</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {conflicts.length === 0 && <p className="text-muted-foreground">No conflicts detected.</p>}
                {conflicts.map((conflict) => (
                  <div key={conflict.id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <p className="font-medium text-destructive">{conflict.target}</p>
                    <p className="mt-1 text-muted-foreground">{conflict.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Main Schema SQL</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[380px] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-50">
                  {data.schemaDiff.mainSql}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Branch Schema SQL</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[380px] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-50">
                  {data.schemaDiff.branchSql}
                </pre>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
