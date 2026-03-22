import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "FlowDB Dashboard",
  description: "Visual control plane for FlowDB branch databases"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${monoFont.variable}`}>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}