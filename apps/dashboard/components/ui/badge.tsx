import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-semibold transition-colors text-sm",
  {
    variants: {
      variant: {
        default: "border border-slate-200 bg-slate-100 text-slate-800",
        outline: "border border-slate-300 bg-white text-slate-700",
        ready: "bg-green-100 text-green-800 px-3 py-1",
        active: "bg-green-100 text-green-800 px-3 py-1",
        migrating: "bg-amber-100 text-amber-800 px-3 py-1 relative",
        conflict: "bg-red-100 text-red-800 px-3 py-1",
        error: "bg-red-100 text-red-800 px-3 py-1",
        closed: "border border-slate-200 bg-slate-100 text-slate-600"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  // Add pulsing dot for migrating status
  if (variant === "migrating") {
    return (
      <div className={cn(badgeVariants({ variant }), className)} {...props}>
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse-dot" />
        {children}
      </div>
    );
  }

  return <div className={cn(badgeVariants({ variant }), className)} {...props}>{children}</div>;
}
