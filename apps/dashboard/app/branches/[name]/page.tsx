"use client";

import { useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useBranchDetail } from "@/lib/queries";

export default function BranchDetailPage() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const params = useParams<{ name: string }>();
  const branchName = decodeURIComponent(params.name ?? "unknown");
  const { data, isLoading, isError, refetch } = useBranchDetail(branchName);

  const timeline = useMemo(() => data?.migrationTimeline ?? [], [data]);
  const conflicts = useMemo(() => data?.conflicts ?? [], [data]);

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
          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Migration Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {timeline.length === 0 && (
                  <p className="text-center text-gray-600 py-4">No migration history available.</p>
                )}
                {timeline.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{item.filename}</span>
                      <Badge variant={item.status}>{item.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{item.timestamp}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Conflict List</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {conflicts.length === 0 && (
                  <p className="text-center text-gray-600 py-4">No conflicts detected.</p>
                )}
                {conflicts.map((conflict) => (
                  <div key={conflict.id} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="font-medium text-red-900">{conflict.target}</p>
                    <p className="mt-1 text-sm text-red-700">{conflict.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Main Schema SQL</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-gray-100 border border-gray-800">
                  {data.schemaDiff.mainSql}
                </pre>
              </CardContent>
            </Card>
            <Card className="border-gray-200 bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Branch Schema SQL</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-gray-100 border border-gray-800">
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
