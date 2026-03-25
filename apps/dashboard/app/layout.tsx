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
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          {children}
          <Toaster position="top-right" richColors closeButton theme="system" />
        </Providers>
      </body>
    </html>
  );
}