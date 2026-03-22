"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/branches", label: "Branches", icon: "🌿" },
  { href: "/settings", label: "Settings", icon: "⚙️" }
];

type SidebarProps = {
  connectionStatus?: "connected" | "disconnected";
};

export function Sidebar({ connectionStatus = "connected" }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="hidden md:fixed md:left-0 md:top-0 md:block md:h-screen md:w-64 md:border-r md:border-gray-200 md:bg-white md:flex md:flex-col">
      {/* Logo Section */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-green-600" />
          <span className="text-lg font-bold text-gray-900">FlowDB</span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "bg-green-50 text-green-700 border-l-4 border-green-600"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-2 text-sm">
          <div
            className={cn(
              "h-2 w-2 rounded-full animate-pulse",
              connectionStatus === "connected" ? "bg-green-500" : "bg-red-500"
            )}
          />
          <span className="text-gray-600">
            {connectionStatus === "connected" ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </div>
  );
}
