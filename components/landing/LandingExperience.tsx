"use client";

import { useEffect, useState } from "react";

const toneRow = [
  ["Warm but clear", ""],
  ["Firm boundary", "dark"],
  ["Client-ready", "gold"],
  ["Shorter", ""],
  ["Technical clarity", "soft"],
] as const;

const outcomeRow = [
  "Reschedule without sounding careless",
  "Push back on scope creep",
  "Explain a technical delay",
  "Ask for a decision politely",
  "Follow up after no reply",
];

const assistantVersions = {
  Safe: "When you have a moment, could you share your decision by tomorrow? It would help me plan the next step clearly.",
  Balanced: "Could you confirm the direction by tomorrow? That will help me keep the next step moving without making assumptions.",
  Firm: "Please confirm the direction by tomorrow so I can proceed without delay.",
};
const assistantTones = Object.keys(assistantVersions) as Array<keyof typeof assistantVersions>;

const useCases = [
  {
    label: "Work updates",
    kicker: "Work update",
    title: "Say the update clearly without over-explaining.",
    copy: "For standups, handoffs and project notes, ProPhrase keeps the message concise while preserving the facts you typed.",
    rough: "api thing is delayed, probably tomorrow, not blocked but need design confirm",
    ready: "The API work is moving, but the final handoff will likely be tomorrow. I’m not blocked right now — I just need design confirmation before closing it out.",
  },
  {
    label: "Difficult conversations",
    kicker: "Firm boundary",
    title: "Hold the boundary without damaging the relationship.",
    copy: "Turn an uncomfortable no into a calm explanation with a clear option for moving forward.",
    rough: "can’t add all this by friday, it wasn’t in scope, don’t want to sound difficult",
    ready: "I can help with the additional work, but it sits outside the scope we agreed and won’t fit the Friday timeline. We can either move the date or decide which current items to replace.",
  },
  {
    label: "Clients",
    kicker: "Client message",
    title: "Share the setback while keeping confidence intact.",
    copy: "Explain what changed, show ownership and give the client a concrete next update instead of vague reassurance.",
    rough: "launch has to move, final review found issue, tell client without making them panic",
    ready: "During final review, we found an issue that needs to be resolved before launch. We’re addressing it now and will send you the revised launch date by 3 PM tomorrow.",
  },
  {
    label: "Technical teams",
    kicker: "Technical clarity",
    title: "Turn incident notes into an update people can act on.",
    copy: "Keep the technical facts while making the current status, impact and next checkpoint obvious.",
    rough: "deploy failed on migration, rollback worked, no customer impact, checking before retry",
    ready: "The deployment failed during the database migration and was rolled back successfully. There is no customer impact. We’re validating the migration fix now and will post the next update before retrying.",
  },
  {
    label: "Careers",
    kicker: "Career message",
    title: "Follow up with confidence, not pressure.",
    copy: "Write a memorable interview follow-up that shows interest, adds context and makes the next step easy.",
    rough: "following up after interview, enjoyed product discussion, still interested, ask about timeline",
    ready: "Thank you again for the conversation, especially our discussion about the product roadmap. It strengthened my interest in the role. When you have a chance, could you share the expected timeline for next steps?",
  },
];

export function LandingMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduced) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -9%", threshold: 0.08 },
    );
    elements.forEach((element) => observer.observe(element));

    const parallaxElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]"),
    );
    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      parallaxElements.forEach((element) => {
        const rect = element.parentElement?.getBoundingClientRect();
        if (!rect) return;
        const progress = (window.innerHeight / 2 - (rect.top + rect.height / 2)) / window.innerHeight;
        const speed = Number(element.dataset.parallax || 28);
        element.style.setProperty("--parallax-y", `${Math.max(-1.6, Math.min(1.6, progress)) * speed}px`);
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };
    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

export function ToneMarquee() {
  return (
    <div className="tone-marquees" aria-label="Quick Style examples">
      <div className="tone-marquee">
        <div className="tone-marquee-track tone-marquee-track-left">
          {[0, 1, 2].map((copy) => (
            <div className="tone-marquee-group" aria-hidden={copy > 0} key={copy}>
              {toneRow.map(([label, variant]) => <span className={`tone-chip ${variant ? `tone-chip-${variant}` : ""}`} key={label}>{label}</span>)}
            </div>
          ))}
        </div>
      </div>
      <div className="tone-marquee">
        <div className="tone-marquee-track tone-marquee-track-right">
          {[0, 1, 2].map((copy) => (
            <div className="tone-marquee-group" aria-hidden={copy > 0} key={copy}>
              {outcomeRow.map((label) => <span className="tone-chip tone-chip-wide" key={label}>{label}</span>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OutcomeAssistant() {
  const [active, setActive] = useState<keyof typeof assistantVersions>("Balanced");

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setActive((current) => assistantTones[(assistantTones.indexOf(current) + 1) % assistantTones.length]);
    }, 4800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="assistant-section">
      <div className="landing-shell">
        <div className="assistant-heading" data-reveal>
          <h2>Tell ProPhrase what you<br />need the message to do.</h2>
          <p>Outcome Assistant combines recipient, goal and tone so you can get a ready version without composing a long instruction.</p>
        </div>
        <div className="assistant-demo" data-reveal>
          <div className="assistant-controls">
            <span className="demo-label demo-label-gold">Outcome Assistant</span>
            <div className="assistant-field"><span>Recipient</span><strong>Project lead</strong></div>
            <div className="assistant-field"><span>Goal</span><strong>Ask for a decision by tomorrow</strong></div>
            <div className="assistant-tabs" role="tablist" aria-label="Message tone">
              {assistantTones.map((tone) => <button aria-selected={active === tone} className={active === tone ? "is-active" : ""} key={tone} onClick={() => setActive(tone)} role="tab" type="button">{tone}</button>)}
            </div>
          </div>
          <div className="assistant-results">
            <span className="demo-label">Generated versions</span>
            {assistantTones.map((tone) => (
              <button className={active === tone ? "assistant-version is-active" : "assistant-version"} key={tone} onClick={() => setActive(tone)} type="button">
                <span>{tone}</span><p>{assistantVersions[tone]}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function UseCaseShowcase() {
  const [active, setActive] = useState(0);
  const item = useCases[active];
  return (
    <section className="moments-section" id="use-cases">
      <div className="landing-shell">
        <div className="moments-heading" data-reveal><h2>Different moments<br />need different words.</h2></div>
        <div className="moments-tabs" data-reveal role="tablist" aria-label="Use cases">
          {useCases.map((entry, index) => <button aria-selected={active === index} className={active === index ? "is-active" : ""} key={entry.label} onClick={() => setActive(index)} role="tab" type="button">{index === 0 ? <span aria-hidden="true">▣</span> : null}{entry.label}</button>)}
        </div>
        <div className="moment-card-reveal" data-reveal>
          <article className="moment-card" key={item.label}>
            <div className="moment-copy">
              <span className="demo-label demo-label-gold">{item.kicker}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </div>
            <div className="moment-example">
              <div><span>Rough</span><p>{item.rough}</p></div>
              <div className="moment-ready"><span>Ready</span><p>{item.ready}</p></div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function UniversalCopy() {
  return (
    <section className="universal-section" id="universal-copy">
      <div className="landing-shell universal-stage">
        <div className="universal-heading" data-reveal>
          <h2>Copy on any device. Paste anywhere.</h2>
          <p>Universal Copy works across iOS, Android and desktop. Copy text on one signed-in device and it appears instantly on your others — ready to paste into any app.</p>
        </div>
        <div className="universal-card universal-card-chat" data-parallax="100">
          <span>Ready on desktop</span><p>I can’t commit to that timeline unless we reduce scope. If we keep the full scope, I’d recommend moving the date.</p><button type="button">Paste into any app any device ↗</button>
        </div>
        <div className="universal-card universal-card-draft" data-parallax="-100">
          <span>Copied on iOS or Android</span><p>I can’t commit to that timeline unless we reduce scope. If we keep the full scope, I’d recommend moving the date.</p>
        </div>
        <div className="universal-badge" data-parallax="-24">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <rect height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" width="13" x="8" y="8" />
            <path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
          <span>Universal Copy</span>
        </div>
      </div>
    </section>
  );
}
