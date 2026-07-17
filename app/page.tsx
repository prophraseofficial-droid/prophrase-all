import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  LandingMotion,
  OutcomeAssistant,
  ToneMarquee,
  UniversalCopy,
  UseCaseShowcase,
} from "@/components/landing/LandingExperience";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
    >
      <path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 12 12">
      <path d="m2.25 6.25 2.2 2.1 5.3-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function Spark() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path d="M8 1.5 9.2 5 12.5 6.2 9.2 7.4 8 11 6.8 7.4 3.5 6.2 6.8 5 8 1.5Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="m12.5 10 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" fill="currentColor" />
    </svg>
  );
}

function RewriteDemo() {
  return (
    <div className="rewrite-demo" aria-label="Example ProPhrase rewrite">
      <article className="rewrite-card rewrite-card-input">
        <div className="rewrite-card-topline">
          <span>Rough input</span>
          <span className="rewrite-caret" aria-hidden="true" />
        </div>
        <p className="rewrite-input-copy">
          need reply to maya. can&apos;t make friday, don&apos;t sound rude. maybe ask monday?
        </p>
        <div className="rewrite-tags">
          <span className="rewrite-tag rewrite-tag-gold">Balanced</span>
          <span className="rewrite-tag">Recipient: Maya</span>
          <span className="rewrite-tag">Outcome: reschedule</span>
        </div>
      </article>

      <div className="rewrite-connector" aria-hidden="true">
        <span />
        <Arrow className="h-4 w-4" />
      </div>

      <article className="rewrite-card rewrite-card-output">
        <div className="rewrite-card-topline text-white/55">
          <span>Ready to send</span>
          <span className="facts-pill"><span>●</span> Facts protected</span>
        </div>
        <p className="rewrite-output-copy">
          Hi Maya — I&apos;m sorry, but I won&apos;t be able to make Friday work. Could we move it to Monday instead? I want to make sure I have enough time to give this proper attention.
        </p>
        <div className="rewrite-output-footer">
          <span>Balanced · direct · kind</span>
          <button className="copy-pill" type="button" aria-label="Copy example message">
            <span aria-hidden="true">⧉</span> Copy
          </button>
        </div>
      </article>
    </div>
  );
}

function ScrollStory() {
  return (
    <div className="story-steps" aria-label="From rough message to ready message">
      <div className="story-step story-step-one"><span>1 · Paste rough</span><p>can you send files today? need by 5 or launch slips</p></div>
      <div className="story-step story-step-two"><span>2 · Choose outcome</span><div><b>Urgent but respectful</b><b>Client</b></div></div>
      <div className="story-step story-step-three"><span>3 · Send confidently</span><p>Could you send the files by 5 PM today? We need them to keep the launch on schedule. If that timing is tight, please let me know what’s realistic.</p></div>
    </div>
  );
}

function FlowIcon({ type }: { type: "paste" | "choose" | "copy" }) {
  if (type === "paste") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
        <path d="M11 8.5h10M12.5 6h7A1.5 1.5 0 0 1 21 7.5v2A1.5 1.5 0 0 1 19.5 11h-7A1.5 1.5 0 0 1 11 9.5v-2A1.5 1.5 0 0 1 12.5 6Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M11 8H8.5A2.5 2.5 0 0 0 6 10.5v15A2.5 2.5 0 0 0 8.5 28h15a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 23.5 8H21" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (type === "choose") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
        <path d="M5 8h22M5 16h22M5 24h22M12 5v6M21 13v6M10 21v6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
      <rect height="18" rx="3" stroke="currentColor" strokeWidth="2.2" width="18" x="10" y="10" />
      <path d="M22 10V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h2" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function PasteChooseCopy() {
  return (
    <section className="flow-section" aria-labelledby="flow-heading">
      <div className="landing-shell">
        <h2 id="flow-heading" data-reveal>Paste → Choose → Copy</h2>
        <div className="flow-grid" data-reveal>
          <article className="flow-card">
            <FlowIcon type="paste" />
            <h3>Paste the rough version</h3>
            <p>Drop in the messy sentence, half-written email or Slack thought exactly as it is.</p>
          </article>
          <article className="flow-card">
            <FlowIcon type="choose" />
            <h3>Choose style or outcome</h3>
            <p>Pick Balanced, Safe or Firm — or guide ProPhrase with a recipient and desired result.</p>
          </article>
          <article className="flow-card flow-card-dark">
            <FlowIcon type="copy" />
            <h3>Copy the final message</h3>
            <p>Send from the tool you already use. No extra prompt, no extra explanation.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const isAuthenticated = Boolean(user);
  const appHref = isAuthenticated ? "/workspace" : "/login";
  const userEmail = user?.email ?? "";
  const userName =
    (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user?.user_metadata?.name === "string" && user.user_metadata.name) ||
    userEmail.split("@")[0] ||
    "";

  return (
    <main className="landing-page" id="top">
      <LandingMotion />
      <LandingHeader
        appHref={appHref}
        fromHomePage
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        userName={userName}
      />

      <section className="landing-hero" id="product">
        <div className="landing-shell">
          <div className="landing-hero-copy" data-reveal>
            <span className="landing-eyebrow"><Spark /> No prompt engineering. Just better messages.</span>
            <h1><span className="hero-rough-phrase">Write it rough.</span> <span className="hero-focus-phrase">Send it right.</span></h1>
            <p>
              ProPhrase turns rough written messages into clear, ready-to-send communication. Paste a thought, choose a style, recipient or outcome, then copy a version that sounds like you meant it.
            </p>
            <div className="landing-proof-row" aria-label="Product benefits">
              <span><Check /> Start free</span>
              <span><Check /> Choose style</span>
              <span><Check /> No long prompts</span>
            </div>
            <div className="landing-hero-actions">
              <Link className="landing-button landing-button-dark" href={appHref}>
                Start free
                <Arrow className="h-4 w-4" />
              </Link>
              <a className="landing-button landing-button-light" href="#see-it-work">See it work</a>
            </div>
          </div>

          <div data-reveal><RewriteDemo /></div>
        </div>
      </section>

      <section className="tone-section" id="use-cases">
        <div className="landing-shell tone-shell">
          <div className="tone-heading" data-reveal>
            <h2>Pick the tone. Keep the truth.</h2>
            <p>Quick Styles turn the same rough message into the version the moment needs — without asking you to write a prompt first.</p>
          </div>
          <ToneMarquee />
        </div>
      </section>

      <section className="workflow-section" id="see-it-work">
        <div className="landing-shell workflow-grid">
          <div className="workflow-copy" data-reveal>
            <span className="section-kicker">Scroll story</span>
            <h2>From messy thought to message you can actually send.</h2>
            <p>
              ProPhrase keeps the important facts fixed while it clarifies tone, structure and next step. The experience feels like editing with intent, not chatting with a blank box.
            </p>
          </div>
          <div data-reveal><ScrollStory /></div>
        </div>
      </section>

      <PasteChooseCopy />
      <OutcomeAssistant />
      <UseCaseShowcase />
      <UniversalCopy />

      <section className="pricing-section" id="pricing">
        <div className="landing-shell">
          <h2 data-reveal>Start free. Upgrade when writing<br />becomes part of your workflow.</h2>
          <div className="pricing-grid" data-reveal>
            <Link href="/pricing"><strong>Free</strong><p>For trying rough-to-ready rewrites and core Quick Styles.</p></Link>
            <Link className="pricing-card-featured" href="/pricing"><strong>Plus</strong><p>For regular work messages, Outcome Assistant and saved writing patterns.</p></Link>
            <Link href="/pricing"><strong>Pro</strong><p>For heavier communication workflows with templates, checks and protected details.</p></Link>
          </div>
        </div>
      </section>

      <section className="final-cta-section">
        <div className="landing-shell">
          <div className="final-cta-card" data-reveal>
            <h2>Write less awkwardly.<br />Communicate more clearly.</h2>
            <p>Rewrite, plan outcomes, and continue across devices from one focused communication workspace.</p>
            <Link className="final-cta-button" href={appHref}>{isAuthenticated ? "Open Workspace" : "Start free"}</Link>
          </div>
        </div>
      </section>

      <LandingFooter fromHomePage />
    </main>
  );
}
