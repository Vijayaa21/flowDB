import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardTone = "ready" | "migrating" | "conflict";

type StatCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: StatCardTone;
};

const toneLabel: Record<StatCardTone, string> = {
  ready: "ready",
  migrating: "migrating",
  conflict: "conflict"
};

export function StatCard({ title, value, icon, tone }: StatCardProps) {
  return (
    <Card className="border-border/80 bg-white/85">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold leading-none tracking-tight">{value}</div>
        <div className="mt-3">
          <Badge variant={tone}>{toneLabel[tone]}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
