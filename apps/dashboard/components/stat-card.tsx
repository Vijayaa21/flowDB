import { Card, CardContent } from "@/components/ui/card";

type StatCardTone = "ready" | "migrating" | "conflict";

type StatCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: StatCardTone;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
};

const toneConfig: Record<StatCardTone, { borderColor: string; iconColor: string }> = {
  ready: { borderColor: "border-t-green-500", iconColor: "text-green-600" },
  migrating: { borderColor: "border-t-amber-500", iconColor: "text-amber-600" },
  conflict: { borderColor: "border-t-red-500", iconColor: "text-red-600" }
};

export function StatCard({ title, value, icon, tone, trend }: StatCardProps) {
  const config = toneConfig[tone];

  return (
    <Card className={`border-0 border-t-4 ${config.borderColor} bg-white shadow-sm hover:shadow-md transition-shadow`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">{title}</p>
            <div className={`text-5xl font-bold tracking-tight text-gray-900`}>
              {value}
            </div>
          </div>
          <div className={`h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center ${config.iconColor}`}>
            {icon}
          </div>
        </div>

        {trend && (
          <div className="flex items-center gap-1">
            <span className={trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-600" : "text-gray-600"}>
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}
            </span>
            <span className="text-sm text-gray-600">
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
