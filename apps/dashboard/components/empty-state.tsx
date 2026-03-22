import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white/50 py-16 px-6">
      {/* Database Branch SVG Illustration */}
      <svg
        className="mb-6 h-24 w-24 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>

      <h2 className="mb-2 text-2xl font-bold text-gray-900">No branches yet</h2>
      <p className="mb-6 text-center text-gray-600">
        Open a pull request on GitHub to create your first branch database
      </p>

      <Link href="https://docs.flowdb.dev" target="_blank" rel="noopener noreferrer">
        <Button className="gap-2">
          Read the docs
          <span>↗</span>
        </Button>
      </Link>
    </div>
  );
}
