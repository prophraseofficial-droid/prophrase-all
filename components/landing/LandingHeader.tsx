import Image from "next/image";
import Link from "next/link";

function Arrow() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingHeader({
  appHref,
  isAuthenticated,
  fromHomePage = false,
}: {
  appHref: string;
  isAuthenticated: boolean;
  fromHomePage?: boolean;
}) {
  const sectionHref = (section: string) => `${fromHomePage ? "" : "/"}#${section}`;

  return (
    <header className="landing-header">
      <div className="landing-shell flex h-full items-center justify-between">
        <Link className="landing-brand" href={sectionHref("top")} aria-label="ProPhrase home">
          <Image
            className="landing-brand-logo"
            src="/prophrase-logo-transparent.png"
            alt=""
            height={32}
            width={32}
            priority
          />
          <span>ProPhrase</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          <Link className="landing-nav-link" href={sectionHref("product")}>Product</Link>
          <Link className="landing-nav-link" href={sectionHref("see-it-work")}>How it works</Link>
          <Link className="landing-nav-link" href={sectionHref("universal-copy")}>Universal Copy</Link>
          <Link className="landing-nav-link" href="/pricing">Pricing</Link>
        </nav>

        <div className="flex items-center gap-2.5">
          {!isAuthenticated ? (
            <Link className="landing-button landing-button-light landing-button-small landing-login-button" href="/login">
              Login
            </Link>
          ) : null}
          <Link className="landing-button landing-button-dark landing-button-small" href={appHref}>
            {isAuthenticated ? "Open Workspace" : "Start free"}
            <Arrow />
          </Link>
        </div>
      </div>
    </header>
  );
}
