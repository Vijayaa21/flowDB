import "./globals.css";
import { Toaster } from "sonner";

type RootLayoutProps = {
  children: unknown;
};

export const metadata = {
  title: "FlowDB Dashboard",
  description: "Manage your database branches"
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <Toaster position="top-right" richColors closeButton theme="system" />
      </body>
    </html>
  );
}