import Image from "next/image";
import Link from "next/link";

export function LandingFooter({ fromHomePage = false }: { fromHomePage?: boolean }) {
  const sectionHref = (section: string) => `${fromHomePage ? "" : "/"}#${section}`;

  return (
    <footer className="landing-footer">
      <div className="landing-shell landing-footer-inner">
        <Link className="landing-footer-brand" href={sectionHref("top")} aria-label="ProPhrase home">
          <Image src="/prophrase-logo-transparent.png" alt="" height={40} width={40} />
          <span>ProPhrase</span>
        </Link>
        <nav className="landing-footer-links" aria-label="Footer navigation">
          <Link href={sectionHref("product")}>Product</Link>
          <Link href={sectionHref("see-it-work")}>How it works</Link>
          <Link href={sectionHref("universal-copy")}>Universal Copy</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/developers/api">API</Link>
          <Link href="/support">Support</Link>
          <Link href="/legal#privacy">Privacy</Link>
        </nav>
        <p>© 2026 ProPhrase. All rights reserved.</p>
      </div>
    </footer>
  );
}
