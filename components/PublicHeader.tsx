import Image from "next/image";
import Link from "next/link";
import { PublicUserMenu } from "@/components/PublicUserMenu";

type PublicHeaderProps = {
  isAuthenticated: boolean;
  active?: "product" | "pricing" | "legal";
  ctaLabel?: string;
  userEmail?: string;
  userName?: string;
};

export function PublicHeader({
  isAuthenticated,
  active = "product",
  ctaLabel,
  userEmail = "",
  userName = "",
}: PublicHeaderProps) {
  const appHref = isAuthenticated ? "/workspace" : "/login";
  const brandHref = isAuthenticated ? "/workspace" : "/#top";
  const resolvedCtaLabel = ctaLabel ?? (isAuthenticated ? "Workspace" : "Try free");

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center bg-white/80 shadow-sm backdrop-blur-3xl">
      <div className="mx-auto flex w-full max-w-container items-center justify-between px-5 md:px-10">
        <Link className="flex items-center gap-3" href={brandHref}>
          <Image
            src="/prophrase-logo.png"
            alt="ProPhrase"
            width={36}
            height={40}
            className="h-10 w-9 rounded-md object-cover"
            priority
          />
          <span className="text-2xl font-bold leading-8 tracking-[-0.01em] text-primary">
            ProPhrase
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link
            className={
              active === "product"
                ? "text-sm font-semibold leading-5 text-primary transition-colors hover:text-primary"
                : "text-sm font-medium leading-5 text-text-muted transition-colors hover:text-primary"
            }
            href="/#how-it-works"
          >
            How it works
          </Link>
          <Link
            className={
              active === "pricing"
                ? "border-b-2 border-primary pb-1 text-sm font-bold leading-5 text-primary"
                : "text-sm font-medium leading-5 text-text-muted transition-colors hover:text-primary"
            }
            href="/pricing"
          >
            Pricing
          </Link>
          <Link
            className="text-sm font-medium leading-5 text-text-muted transition-colors hover:text-primary"
            href="/#examples"
          >
            Examples
          </Link>
          {isAuthenticated ? null : (
            <Link
              className="text-sm font-medium leading-5 text-text-muted transition-colors hover:text-primary"
              href="/login"
            >
              Login
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-full bg-primary px-6 py-2 text-sm font-medium leading-5 text-on-primary transition-all hover:opacity-90 active:scale-95"
            href={appHref}
          >
            {resolvedCtaLabel}
          </Link>
          {isAuthenticated ? (
            <PublicUserMenu userEmail={userEmail} userName={userName} />
          ) : null}
        </div>
      </div>
    </header>
  );
}
