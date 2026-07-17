import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailLoginForm } from "@/components/auth/EmailLoginForm";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/workspace");
  }

  return (
    <main className="login-page relative flex min-h-screen overflow-hidden bg-[#F2EAD6]">
      <div className="radial-glow pointer-events-none absolute inset-0" />
      <div className="pointer-events-none fixed left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-[#F2EAD6] blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-5%] right-[-5%] h-[30%] w-[30%] rounded-full bg-[#F2EAD6] blur-[100px]" />

      <section className="relative hidden flex-1 flex-col justify-center overflow-hidden bg-[#F2EAD6] px-10 md:flex">
        <div className="mx-auto max-w-[500px] space-y-8">
          <Link className="mb-16 inline-flex" href="/">
            <Image
              src="/prophrase-logo-transparent.png"
              alt="ProPhrase"
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg object-cover"
              priority
            />
          </Link>

          <div className="space-y-4">
            <h1 className="text-[40px] font-semibold leading-[48px] tracking-[-0.02em] text-primary">
              Say it better at work
            </h1>
            <p className="text-lg leading-7 text-text-muted">
              Transform your communication with AI precision. Draft emails,
              Slack messages, and documents that command respect and clarity.
            </p>
          </div>

          <div className="glass-card animate-floating mt-12 rounded-[24px] p-8 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#dfb63f]" />
                <span className="text-xs font-semibold uppercase leading-4 text-text-muted">
                  Original
                </span>
              </div>
              <div className="rounded-xl bg-[#f7f1e3] p-4 text-base italic leading-6 text-text-muted">
                &quot;Hey, can you check that thing? I need it ASAP because
                we&apos;re late.&quot;
              </div>
              <div className="flex justify-center py-2 text-[#c8c6c5]">
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 5v14" />
                  <path d="m19 12-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#11110e]" />
                <span className="text-xs font-semibold uppercase leading-4 text-[#927019]">
                  Refined by ProPhrase
                </span>
              </div>
              <div className="rounded-xl border border-[#dfb63f]/30 bg-[#fffdf8] p-4 text-base font-medium leading-6 text-primary">
                &quot;I would appreciate your review of the project status. To
                ensure we meet our deadline, could you provide an update at your
                earliest convenience?&quot;
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 flex flex-1 items-center justify-center px-5 md:px-0">
        <div className="w-full max-w-[420px]">
          <Link className="mb-8 flex justify-center md:hidden" href="/">
            <Image
              src="/prophrase-logo-transparent.png"
              alt="ProPhrase"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover"
              priority
            />
          </Link>

          <div className="glass-card rounded-[32px] p-8 shadow-2xl shadow-primary/5 md:p-10">
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-2xl font-semibold leading-8 tracking-[-0.01em] text-primary">
                Welcome back
              </h2>
              <p className="text-base leading-6 text-text-muted">
                Elevate your professional voice.
              </p>
            </div>

            <div className="space-y-6">
              <EmailLoginForm />

              <div className="relative flex items-center justify-center py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-subtle" />
                </div>
                <span className="relative bg-[#fffdf8] px-4 text-xs font-semibold uppercase leading-4 tracking-[0.18em] text-text-muted">
                  or
                </span>
              </div>

              <GoogleLoginButton />
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm font-medium leading-5 text-text-muted">
                Don&apos;t have an account?{" "}
                <Link
                  className="font-semibold text-primary decoration-ai-purple/30 hover:underline"
                  href="/workspace"
                >
                  Sign up for free
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-6">
            <Link
              className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary"
              href="/legal"
            >
              Privacy Policy
            </Link>
            <Link
              className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary"
              href="/legal"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
