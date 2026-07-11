import { Suspense } from "react";
import { AuthFinishClient } from "@/components/auth/AuthFinishClient";

export default function AuthFinishPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-surface px-5">
          <section className="w-full max-w-md rounded-[28px] border border-border-subtle bg-white p-8 text-center shadow-lg">
            <h1 className="mb-3 text-2xl font-semibold text-primary">
              Signing you in
            </h1>
            <p className="text-sm leading-6 text-text-muted">
              Completing sign-in...
            </p>
          </section>
        </main>
      }
    >
      <AuthFinishClient />
    </Suspense>
  );
}
