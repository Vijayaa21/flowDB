import "./globals.css";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

import { Providers } from "./providers";

type RootLayoutProps = {
  children: ReactNode;
};

export const metadata = {
  title: "FlowDB Dashboard",
  description: "Manage your database branches"
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="bg-[var(--gh-canvas-subtle)] text-[var(--gh-fg-default)]">
        <Providers>
          {children}
          <Toaster position="top-right" richColors closeButton theme="system" />
        </Providers>
      </body>
    </html>
  );
}