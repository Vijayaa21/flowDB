import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-slate-200 bg-slate-100 text-slate-800",
        outline: "border-slate-300 bg-white text-slate-700",
        ready: "border-emerald-200 bg-emerald-100 text-emerald-800",
        active: "border-emerald-200 bg-emerald-100 text-emerald-800",
        migrating: "border-amber-200 bg-amber-100 text-amber-800",
        conflict: "border-rose-200 bg-rose-100 text-rose-800",
        error: "border-rose-200 bg-rose-100 text-rose-800",
        closed: "border-slate-200 bg-slate-100 text-slate-600"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
