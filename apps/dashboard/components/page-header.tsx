"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb?: string[];
  lastRefreshed?: Date;
  onRefresh?: () => void;
};

export function PageHeader({
  title,
  description,
  breadcrumb,
  lastRefreshed,
  onRefresh
}: PageHeaderProps) {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="mb-8">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
          {breadcrumb.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              {idx > 0 && <span className="text-gray-400">/</span>}
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Title and Controls */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-2 text-gray-600">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Last refreshed
              </p>
              <p className="text-sm text-gray-700">{formatTime(lastRefreshed)}</p>
            </div>
          )}
          {onRefresh && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
