"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthAwarePublicHeader } from "@/components/AuthAwarePublicHeader";

type LegalTab = "privacy" | "terms";

const privacySections = [
  {
    title: "1. Introduction",
    body: "At ProPhrase, your privacy is our foundational principle. We build tools to enhance your writing, not to harvest your data. This policy outlines how we handle the information you entrust to us while using our AI-assisted writing services.",
  },
  {
    title: "2. Information We Collect",
    body: "We minimize data collection to only what is strictly necessary to provide the service:",
    bullets: [
      ["Account Details:", "Email and basic profile info for authentication."],
      ["Text Inputs:", "The text you explicitly provide for processing or refinement."],
      ["Usage Metadata:", "Diagnostic data to improve platform stability."],
    ],
  },
  {
    title: "3. Data Retention",
    body: "We retain your drafts and account data only as long as your account remains active. You can request a complete deletion of your data through your account settings at any time, which will be processed within 48 hours.",
  },
];

const termsSections = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing or using ProPhrase, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service. These terms apply to all visitors, users, and others who access the service.",
  },
  {
    title: "2. Fair Use Policy",
    body: "To ensure high quality for all users, we implement a fair use policy:",
    bullets: [
      ["", "No automated scraping or bulk harvesting of AI responses."],
      ["", "No use of the service to generate harmful, illegal, or deceptive content."],
      ["", "Respect for rate limits based on your subscription tier."],
    ],
  },
  {
    title: "3. Intellectual Property",
    body: "You own the copyright to the original text you input and the final outputs generated for you by ProPhrase. ProPhrase owns the software, brand, and underlying architecture of the platform.",
  },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    brain: (
      <>
        <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
        <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
        <path d="M12 5v14" />
        <path d="M8 9h3" />
        <path d="M13 9h3" />
        <path d="M8 14h3" />
        <path d="M13 14h3" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </>
    ),
    gavel: (
      <>
        <path d="m14 13-7 7" />
        <path d="m8 8 8 8" />
        <path d="m6 10 4-4" />
        <path d="m14 18 4-4" />
        <path d="M3 21h8" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={`inline-flex h-[1em] w-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function LegalContent({ activeTab }: { activeTab: LegalTab }) {
  if (activeTab === "terms") {
    return (
      <article className="space-y-10">
        <section>
          <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
            {termsSections[0].title}
          </h2>
          <p className="text-lg leading-relaxed text-text-muted">
            {termsSections[0].body}
          </p>
        </section>

        <section className="rounded-2xl border border-[#ba1a1a]/10 bg-[#ba1a1a]/5 p-8">
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold leading-8 tracking-[-0.01em] text-[#ba1a1a]">
            <Icon className="text-2xl" name="warning" />
            AI Output Disclaimer
          </h2>
          <p className="text-base leading-relaxed text-text-muted">
            ProPhrase provides AI-generated suggestions. While we strive for
            accuracy, we do not guarantee the factual correctness, legal
            compliance, or suitability of the output for any specific purpose.
            Users retain full responsibility for the final content they publish
            or distribute.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
            {termsSections[1].title}
          </h2>
          <p className="mb-4 text-lg leading-relaxed text-text-muted">
            {termsSections[1].body}
          </p>
          <ul className="space-y-3">
            {termsSections[1].bullets?.map(([, text]) => (
              <li className="flex items-start gap-4" key={text}>
                <Icon className="mt-1 text-xl text-primary" name="shield" />
                <span className="text-base leading-6 text-text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
            {termsSections[2].title}
          </h2>
          <p className="text-lg leading-relaxed text-text-muted">
            {termsSections[2].body}
          </p>
        </section>
      </article>
    );
  }

  return (
    <article className="space-y-10">
      <section>
        <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
          {privacySections[0].title}
        </h2>
        <p className="text-lg leading-relaxed text-text-muted">
          {privacySections[0].body}
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
          {privacySections[1].title}
        </h2>
        <p className="mb-4 text-lg leading-relaxed text-text-muted">
          {privacySections[1].body}
        </p>
        <ul className="space-y-3">
          {privacySections[1].bullets?.map(([label, text]) => (
            <li className="flex items-start gap-4" key={label}>
              <Icon className="mt-1 text-xl text-accent-warm" name="check" />
              <span className="text-base leading-6 text-text-muted">
                <strong className="text-primary">{label}</strong> {text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-accent-warm/10 bg-accent-warm/5 p-8">
        <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold leading-8 tracking-[-0.01em]">
          <Icon className="text-2xl text-accent-warm" name="brain" />
          AI Processing
        </h2>
        <p className="text-base leading-relaxed text-text-muted">
          Your inputs are processed using secure LLM protocols. By default, your
          data is used for real-time generation and is not used to train global
          AI models without your explicit, opt-in consent. ProPhrase utilizes
          enterprise-grade encryption for all data in transit.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold leading-8 tracking-[-0.01em]">
          {privacySections[2].title}
        </h2>
        <p className="text-lg leading-relaxed text-text-muted">
          {privacySections[2].body}
        </p>
      </section>
    </article>
  );
}

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<LegalTab>("privacy");

  return (
    <main className="relative overflow-hidden bg-surface text-text-primary">
      <AuthAwarePublicHeader active="legal" ctaLabel="Get Started" />

      <div className="relative px-5 pb-24 pt-32 md:px-10">
        <section className="relative mx-auto mb-16 max-w-4xl text-center">
          <div className="radial-gradient-glow absolute inset-0 -z-10 -translate-y-12 scale-150" />
          <h1 className="mb-4 text-[44px] font-bold leading-[48px] tracking-[-0.03em] text-primary md:text-[72px] md:leading-[76px] md:tracking-[-0.04em]">
            Privacy & Terms
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-7 text-text-muted">
            Clear policies for a simple AI writing assistant.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold leading-4 text-text-muted/60">
            <Icon className="text-sm" name="info" />
            <span>
              ProPhrase never sells your sensitive information to third parties.
            </span>
          </div>
        </section>

        <div className="mb-8 flex justify-center">
          <div className="flex gap-1 rounded-full border border-border-subtle bg-surface-container-low p-1.5 shadow-sm">
            {(["privacy", "terms"] as const).map((tab) => (
              <button
                className={
                  activeTab === tab
                    ? "rounded-full bg-primary px-8 py-2.5 text-sm font-medium leading-5 text-on-primary shadow-md transition-all"
                    : "rounded-full px-8 py-2.5 text-sm font-medium leading-5 text-text-muted transition-all hover:text-primary"
                }
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab === "privacy" ? "Privacy Policy" : "Terms of Service"}
              </button>
            ))}
          </div>
        </div>

        <section className="relative mx-auto max-w-[900px]">
          <div className="absolute -right-4 -top-4 z-10 hidden sm:block">
            <span className="flex items-center gap-2 rounded-full border border-accent-warm/30 bg-[#fef8ec] px-4 py-1.5 text-xs font-semibold leading-4 text-[#8b6521] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-accent-warm" />
              Starter template
            </span>
          </div>
          <div className="glass-panel min-h-[600px] rounded-[32px] border border-border-subtle p-8 shadow-[0_4px_40px_rgba(0,0,0,0.03)] md:p-16">
            <LegalContent activeTab={activeTab} />
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-white p-6 shadow-sm md:flex-row">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-warm/10">
                <Icon className="text-xl text-accent-warm" name="gavel" />
              </div>
              <div>
                <p className="text-sm font-medium leading-5 text-text-primary">
                  Legal Notice
                </p>
                <p className="text-xs font-semibold leading-4 text-text-muted">
                  Important: This is a starter policy template. Review it with a
                  professional.
                </p>
              </div>
            </div>
            <button
              className="text-sm font-medium leading-5 text-primary transition-all hover:underline"
              type="button"
            >
              Download PDF
            </button>
          </div>
        </section>
      </div>

      <footer className="w-full border-t border-border-subtle bg-surface py-8">
        <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-6 px-5 md:flex-row md:px-10">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <span className="text-2xl font-bold leading-8 tracking-[-0.01em] text-primary">
              ProPhrase
            </span>
            <p className="text-xs font-semibold leading-4 text-text-muted">
              © 2024 ProPhrase. All rights reserved.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <button
              className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary"
              onClick={() => setActiveTab("privacy")}
              type="button"
            >
              Privacy Policy
            </button>
            <button
              className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary"
              onClick={() => setActiveTab("terms")}
              type="button"
            >
              Terms of Service
            </button>
            <Link className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary" href="/legal">
              Security
            </Link>
            <Link className="text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary" href="/workspace">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
