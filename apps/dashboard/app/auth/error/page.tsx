import { Suspense } from "react";

import AuthErrorPageClient from "./auth-error-page-client";

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AuthErrorPageClient />
    </Suspense>
  );
}
