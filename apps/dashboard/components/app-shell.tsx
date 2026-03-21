import Link from "next/link";

import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
};

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/branches", label: "Branches" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dff4ff_0%,#eff9ff_35%,#f7fbff_65%,#ffffff_100%)] text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <header className="mb-8 rounded-2xl border bg-white/85 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-700">FlowDB</p>
              <h1 className="text-2xl font-bold">Branch Operations Dashboard</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    "hover:border-cyan-500 hover:bg-cyan-50"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
