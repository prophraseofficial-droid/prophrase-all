"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthAwareLandingHeader } from "@/components/landing/AuthAwareLandingHeader";

type LegalTab = "privacy" | "terms";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: Array<{ label?: string; text: string }>;
};

const LAST_UPDATED = "16 July 2026";
const LEGAL_EMAIL = "privacy@prophrase.in";

const privacySections: LegalSection[] = [
  {
    title: "1. Scope and who this policy covers",
    paragraphs: [
      "This Privacy Policy explains how ProPhrase collects, uses, stores and shares information when you use prophrase.in, the ProPhrase workspace, browser extension, mobile or desktop clients, developer APIs, Universal Copy and related services (together, the “Service”).",
      "ProPhrase is designed for professional and business communication and is not directed to anyone under 18. If you do not agree with this policy, do not use the Service or submit personal or confidential information to it.",
    ],
  },
  {
    title: "2. Information we collect",
    bullets: [
      {
        label: "Account and profile information",
        text: "Your email address, name, avatar, authentication identifiers, plan, account status and sign-in information supplied by you or your identity provider.",
      },
      {
        label: "Writing content",
        text: "Drafts, selected text, instructions, recipients, goals, tones, generated versions, feedback and other content you choose to submit. Saved workspace threads and messages remain associated with your account until they are removed under our retention practices.",
      },
      {
        label: "Extension and device information",
        text: "A device identifier and label, platform, extension authentication status, selected text and the minimum active-page access needed when you invoke the extension. ProPhrase does not intentionally collect your full browsing history.",
      },
      {
        label: "Universal Copy information",
        text: "Copied text, a short preview, source and receiving device labels, status, timestamps and expiry information used to make text available across your signed-in devices.",
      },
      {
        label: "Usage, credits and diagnostics",
        text: "Feature used, request and response timing, character and token counts, credit cost, credit grants and expiry, rate-limit events, error information, model tier and security or abuse-prevention records. Billing usage records are designed to store operational metadata rather than the full text of your request.",
      },
      {
        label: "Payments and subscriptions",
        text: "Plan, billing interval, subscription status, transaction or provider reference identifiers and limited payment-event information. Payment credentials are collected and processed by Razorpay; ProPhrase does not receive or store your complete card number or security code.",
      },
      {
        label: "Preferences and local storage",
        text: "Writing-style settings, recent history, device identifiers, session information and extension tokens may be stored in your browser or extension storage so the Service works across visits.",
      },
    ],
  },
  {
    title: "3. How we use information",
    bullets: [
      { text: "Authenticate you, secure your account and connect approved devices." },
      { text: "Provide rewrites, Outcome Assistant, saved history, Universal Copy, developer APIs and other requested features." },
      { text: "Measure and deduct credits consistently across the workspace, extension and API." },
      { text: "Process subscriptions, maintain billing records and provide plan entitlements." },
      { text: "Prevent fraud, abuse, token misuse and security incidents; enforce rate limits and these Terms." },
      { text: "Troubleshoot, maintain, analyze and improve reliability, safety and user experience." },
      { text: "Comply with legal obligations and protect the rights, safety and integrity of users, ProPhrase and others." },
    ],
  },
  {
    title: "4. AI processing",
    paragraphs: [
      "ProPhrase sends the content and instructions needed for a requested rewrite or outcome to Google’s Gemini API. Depending on the configured Gemini service tier, Google may retain or use prompts, responses and related metadata as described in its then-current Gemini API terms. In particular, free or unpaid API services may provide different data-use protections from paid services.",
      "Do not submit passwords, payment credentials, regulated records, trade secrets or other information you are not authorized to share. ProPhrase does not use your private writing content to train its own general-purpose model, but it cannot override the independent data practices of an AI provider.",
    ],
  },
  {
    title: "5. When we share information",
    paragraphs: [
      "We do not sell your personal data. We disclose information only as needed to operate the Service, complete a transaction, follow your instruction, protect the Service or comply with law.",
    ],
    bullets: [
      { label: "Google Gemini", text: "for AI generation and safety processing." },
      { label: "Supabase", text: "for authentication, database and application infrastructure." },
      { label: "Razorpay", text: "for checkout, payment and subscription processing." },
      { label: "Operational providers", text: "such as hosting, security, email and monitoring vendors acting for ProPhrase." },
      { label: "Legal or business events", text: "when required by law, to investigate misuse, or as part of a merger, financing, reorganization or transfer of the Service, subject to appropriate safeguards." },
    ],
  },
  {
    title: "6. Browser extension permissions",
    paragraphs: [
      "The extension requests active-tab, scripting, context-menu, identity and local-storage permissions. It uses these permissions to read or replace text on the active page when you ask it to, authenticate your ProPhrase account, remember a pending selection and call ProPhrase services. It is not designed to operate as a general browsing-history tracker.",
      "Text saved in extension storage and the extension access token remain on your browser profile until used, replaced, cleared or the extension is removed. Treat any signed-in browser profile as an authorized device and sign out or revoke the extension token if a device is lost or shared.",
      "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.",
    ],
  },
  {
    title: "7. Universal Copy",
    paragraphs: [
      "Universal Copy places text on ProPhrase servers so another signed-in device can retrieve it. A copy is normally available for 10 minutes and may be claimed once. The expiry stops normal retrieval; it does not necessarily mean the database record is deleted at that exact moment. Related content and metadata may remain until routine cleanup or account deletion.",
      "Universal Copy is not an end-to-end encrypted password manager, secure vault or backup service. Do not use it for passwords, one-time codes, financial credentials, health records or other highly sensitive information.",
    ],
  },
  {
    title: "8. Retention and deletion",
    paragraphs: [
      "We retain account information while your account is active and as reasonably needed to provide the Service. Saved threads, messages and generated content may remain in your history; archiving a thread may hide it without immediately deleting the underlying record. Local browser history remains until you clear it or your browser removes it.",
      "Device registrations and API or extension-token records remain until revoked, expired, deleted or no longer operationally required. Credit, subscription, payment, fraud-prevention and security records may be kept for the period required for accounting, dispute resolution, legal compliance and service integrity.",
      "You may request account or personal-data deletion by contacting us. We may retain limited information where required by law, to complete an active transaction, resolve a dispute, prevent fraud or establish and defend legal claims.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "We use reasonable technical and organizational safeguards, including authenticated access, row-level data controls, hashed API-token storage, access restrictions and encrypted network transport where supported. No online service is completely secure, so we cannot guarantee that information will never be accessed, lost or disclosed without authorization.",
      "You are responsible for protecting your account, browser profile, devices and API or extension tokens. Notify us promptly if you believe your account or token has been compromised.",
    ],
  },
  {
    title: "10. International processing",
    paragraphs: [
      "Our providers may process information in India and other countries where they or their subprocessors operate. Those locations may have different data-protection laws. Where required, we use contractual or other lawful safeguards for cross-border processing.",
    ],
  },
  {
    title: "11. Your choices and rights",
    paragraphs: [
      "Depending on applicable law, you may request access to, correction of or deletion of personal data, withdraw consent, object to or restrict certain processing, request information about sharing, or raise a grievance. You may also clear local history, revoke an extension or API token, stop using Universal Copy, cancel a subscription or stop using the Service.",
      "We may need to verify your identity before completing a request. Withdrawing consent or deleting required information may prevent some or all of the Service from working. You may use any complaint or appeal mechanism available under applicable law.",
    ],
  },
  {
    title: "12. Changes and contact",
    paragraphs: [
      `We may update this policy as the Service, providers or law changes. We will post the revised policy with a new “Last updated” date and provide additional notice where required. For privacy questions, grievances or data-rights requests, email ${LEGAL_EMAIL}.`,
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    title: "1. Agreement and eligibility",
    paragraphs: [
      "These Terms of Service govern your use of the ProPhrase Service. By creating an account, installing or connecting the extension, using an API token, purchasing a plan or otherwise using the Service, you agree to these Terms and the Privacy Policy.",
      "You must be at least 18 and legally able to enter into this agreement. If you use ProPhrase for an organization, you represent that you have authority to bind that organization, and “you” includes that organization.",
    ],
  },
  {
    title: "2. The Service",
    paragraphs: [
      "ProPhrase provides AI-assisted rewriting, Outcome Assistant, message history, templates or preferences, Universal Copy, browser-extension functionality, mobile and desktop access, developer APIs, usage credits and related tools. Features, models, limits and availability may differ by plan, device, region or deployment and may change over time.",
      "The Service may depend on third-party platforms, including Google Gemini, Supabase, browser stores, operating systems and Razorpay. An interruption, policy change or quota imposed by a third party may affect the Service.",
    ],
  },
  {
    title: "3. Accounts, devices and tokens",
    paragraphs: [
      "Provide accurate account information and keep your account, devices and credentials secure. You are responsible for activity performed through your account, extension connection or API token unless prohibited by law.",
      "API and extension tokens are confidential credentials. Do not publish, share, sell, reverse engineer or embed them in public client code. Revoke a token and contact us if you suspect unauthorized use.",
    ],
  },
  {
    title: "4. User content and permission to process it",
    paragraphs: [
      "You retain the rights you have in content you submit. You grant ProPhrase and its service providers a limited, non-exclusive right to host, transmit, reproduce, modify and process that content only as needed to operate, secure and improve the Service, follow your instructions and comply with law.",
      "You represent that you have all rights and permissions needed to submit the content and that processing it will not violate law, confidentiality duties, intellectual-property rights or another person’s privacy. Do not submit content that you are prohibited from sending to an AI or cloud provider.",
    ],
  },
  {
    title: "5. AI output and user responsibility",
    paragraphs: [
      "AI output may be inaccurate, incomplete, biased, offensive, outdated or similar to content generated for others. ProPhrase attempts to preserve meaning and surface warnings, but does not guarantee factual accuracy, originality, legal compliance or suitability for any purpose.",
      "Review every output before sending or relying on it. You remain responsible for the final message and its consequences. ProPhrase is not a substitute for legal, medical, financial, employment, compliance or other professional advice, and you must not use it to make automated high-impact decisions about a person.",
    ],
  },
  {
    title: "6. Acceptable use",
    bullets: [
      { text: "Do not use the Service for illegal, fraudulent, deceptive, harassing, discriminatory, exploitative or harmful activity." },
      { text: "Do not create or distribute malware, phishing, spam, impersonation, non-consensual intimate content, sexual content involving minors, or content that meaningfully facilitates violence or wrongdoing." },
      { text: "Do not scrape, crawl, resell or bulk-harvest the Service or outputs; bypass safeguards, rate limits or credit controls; or interfere with networks, accounts or other users." },
      { text: "Do not probe for vulnerabilities, reverse engineer protected parts of the Service, use stolen credentials, or use the Service to develop a competing model in violation of a provider’s terms." },
      { text: "Comply with the Google Gemini prohibited-use rules, applicable browser-store policies and all laws that apply to your content and use." },
    ],
  },
  {
    title: "7. Universal Copy",
    paragraphs: [
      "Universal Copy is a convenience feature, not secure archival storage. Copied text normally expires from retrieval after 10 minutes and may be overwritten, claimed, lost or unavailable. Keep your own copy of important information and do not place credentials or highly sensitive data in Universal Copy.",
      "You are responsible for every device connected to your account. A person with access to a signed-in device may be able to retrieve available copied text.",
    ],
  },
  {
    title: "8. Credits, free access and paid plans",
    paragraphs: [
      "Free accounts may receive a daily credit allowance. Paid plans may include recurring credits, features or higher limits. Credits are a limited license to request eligible operations; they are not money, have no cash value, are non-transferable and may expire or reset as displayed in the Service or plan description.",
      "A successful operation may consume the stated number of credits across the workspace, extension and API. Failed operations may be released or refunded according to the Service’s billing logic. We may correct errors, duplicate grants, abuse or fraudulent credit balances.",
      "Prices, taxes, billing intervals, included credits and renewal terms are shown before purchase. Subscriptions may renew automatically until cancelled. Paid upgrades normally take effect immediately and Razorpay may charge or refund the prorated difference for the unused portion of the current period. Downgrades, annual-to-monthly switches and cancellations normally take effect at the end of the paid period, with the new price charged at the next renewal. Payments and eligible refunds are processed through Razorpay and remain subject to applicable law and the checkout terms shown at purchase.",
    ],
  },
  {
    title: "9. Developer API",
    paragraphs: [
      "API access is subject to the documentation, rate limits, credit costs and security requirements published by ProPhrase. You may use the API only in applications you control and must provide appropriate disclosures to your own users. You may not expose an API token in public code or use the API to avoid plan limits or provide an unauthorized competing service.",
    ],
  },
  {
    title: "10. ProPhrase property",
    paragraphs: [
      "ProPhrase and its licensors own the Service, software, interface, brand, documentation, prompts, safety systems and related intellectual property, excluding your content. These Terms grant you a limited, revocable, non-exclusive, non-transferable right to use the Service for its intended purpose during the term of your account.",
      "To the extent permitted by law and third-party rights, ProPhrase does not claim ownership of the text generated for you. Outputs may not qualify for intellectual-property protection and the same or similar output may be provided to others.",
    ],
  },
  {
    title: "11. Suspension and termination",
    paragraphs: [
      "You may stop using the Service or cancel a subscription at any time. We may limit, suspend or terminate access if you breach these Terms, create risk or legal exposure, misuse credits or tokens, fail to pay, or if continued operation is impracticable because of law or a third-party provider.",
      "On termination, your right to use the Service ends. Provisions that by nature should survive—including payment obligations, intellectual property, disclaimers, limitations and dispute terms—will survive. Data will be handled under the Privacy Policy.",
    ],
  },
  {
    title: "12. Service changes and availability",
    paragraphs: [
      "We may add, remove or change features, models, limits and plans. We will provide notice where law or an active paid commitment requires it. The Service may be unavailable during maintenance, provider outages, quota exhaustion, security events or circumstances beyond our reasonable control.",
    ],
  },
  {
    title: "13. Disclaimers and limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, the Service is provided “as is” and “as available,” without warranties of uninterrupted availability, merchantability, fitness for a particular purpose, non-infringement or error-free output.",
      "To the maximum extent permitted by law, ProPhrase and its operators, affiliates and providers will not be liable for indirect, incidental, special, consequential, exemplary or punitive loss, or for lost profits, data, business, reputation or opportunities arising from the Service, AI output, account compromise or third-party services. Nothing in these Terms limits liability or consumer rights that cannot lawfully be limited.",
    ],
  },
  {
    title: "14. Governing law, changes and contact",
    paragraphs: [
      `These Terms are governed by the laws of India, without regard to conflict-of-law principles. Courts with competent jurisdiction in India will have jurisdiction, except where applicable law gives you another forum or mandatory right. We may update these Terms and will post a new effective date and provide additional notice where required. Continued use after the effective date means you accept the revised Terms. Questions or legal notices may be sent to ${LEGAL_EMAIL}.`,
    ],
  },
];

function PolicySection({ section }: { section: LegalSection }) {
  return (
    <section className="border-t border-[#ddd4c2] py-9 first:border-t-0 first:pt-0 md:py-12">
      <h2 className="max-w-3xl text-2xl font-bold leading-tight tracking-[-0.025em] text-[#11110e] md:text-[32px]">
        {section.title}
      </h2>
      {section.paragraphs?.map((paragraph) => (
        <p
          className="mt-5 max-w-3xl text-base leading-7 text-[#5f5a4f] md:text-lg md:leading-8"
          key={paragraph}
        >
          {paragraph}
        </p>
      ))}
      {section.bullets ? (
        <ul className="mt-6 max-w-3xl space-y-4">
          {section.bullets.map((bullet) => (
            <li className="flex gap-3 text-base leading-7 text-[#5f5a4f] md:text-lg" key={`${bullet.label ?? "item"}-${bullet.text}`}>
              <span aria-hidden="true" className="mt-[11px] h-2 w-2 shrink-0 bg-[#dfb63f]" />
              <span>
                {bullet.label ? <strong className="font-semibold text-[#11110e]">{bullet.label}: </strong> : null}
                {bullet.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<LegalTab>("privacy");
  const sections = activeTab === "privacy" ? privacySections : termsSections;

  useEffect(() => {
    function syncTabFromHash() {
      setActiveTab(window.location.hash === "#terms" ? "terms" : "privacy");
    }

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  function selectTab(tab: LegalTab) {
    setActiveTab(tab);
    window.history.replaceState(null, "", tab === "privacy" ? "#privacy" : "#terms");
  }

  return (
    <main className="landing-page min-h-screen bg-[#f7f1e3] text-[#11110e]">
      <AuthAwareLandingHeader />

      <section className="border-b border-[#ddd4c2] px-5 pb-16 pt-24 text-center md:px-10 md:pb-20 md:pt-28">
        <p className="mx-auto inline-flex items-center gap-2 border border-[#ddc985] bg-[#f4e8bc] px-4 py-2 text-sm font-semibold text-[#775d18]">
          <span aria-hidden="true" className="h-2 w-2 bg-[#dfb63f]" />
          Last updated {LAST_UPDATED}
        </p>
        <h1 className="mx-auto mt-7 max-w-5xl text-[48px] font-bold leading-[0.96] tracking-[-0.055em] md:text-[82px]">
          Clear terms. Honest privacy.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#686255] md:text-xl">
          How ProPhrase handles your account, writing content, AI processing,
          browser extension, Universal Copy, credits and payments.
        </p>
      </section>

      <div className="sticky top-0 z-20 border-b border-[#ddd4c2] bg-[#f7f1e3]/95 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-5xl justify-center">
          <div className="grid w-full max-w-xl grid-cols-2 border border-[#11110e] bg-white p-1">
            {(["privacy", "terms"] as const).map((tab) => {
              const selected = activeTab === tab;
              return (
                <button
                  aria-pressed={selected}
                  className={`px-5 py-3 text-sm font-semibold transition-colors md:text-base ${
                    selected
                      ? "bg-[#11110e] text-[#fffaf0]"
                      : "bg-white text-[#5f5a4f] hover:bg-[#f4e8bc] hover:text-[#11110e]"
                  }`}
                  key={tab}
                  onClick={() => selectTab(tab)}
                  type="button"
                >
                  {tab === "privacy" ? "Privacy Policy" : "Terms of Service"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="px-5 py-12 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <aside className="h-fit border border-[#d9cfbb] bg-[#f0e3bd] p-6 lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6b18]">
              {activeTab === "privacy" ? "Privacy summary" : "Terms summary"}
            </p>
            <p className="mt-4 text-xl font-bold leading-7 tracking-[-0.02em]">
              {activeTab === "privacy"
                ? "Your writing is processed to provide the features you request."
                : "Use ProPhrase responsibly and review every AI-generated message."}
            </p>
            <p className="mt-4 text-sm leading-6 text-[#686255]">
              {activeTab === "privacy"
                ? "ProPhrase does not sell personal data. AI, infrastructure and payment providers process limited data for their specific roles."
                : "Credits, extension access, Universal Copy and the developer API are all part of these Terms."}
            </p>
            <a
              className="mt-6 inline-flex border border-[#11110e] bg-[#11110e] px-4 py-2.5 text-sm font-semibold text-[#fffaf0] transition-colors hover:bg-[#dfb63f] hover:text-[#11110e]"
              href={`mailto:${LEGAL_EMAIL}`}
            >
              Contact privacy team
            </a>
          </aside>

          <article className="border border-[#d9cfbb] bg-[#fffdf8] p-7 md:p-12">
            <div className="mb-10 border-b border-[#ddd4c2] pb-9">
              <p className="text-sm font-semibold text-[#8a6b18]">Effective {LAST_UPDATED}</p>
              <h2 className="mt-3 text-[36px] font-bold leading-none tracking-[-0.04em] md:text-[52px]">
                {activeTab === "privacy" ? "Privacy Policy" : "Terms of Service"}
              </h2>
            </div>
            {sections.map((section) => (
              <PolicySection key={section.title} section={section} />
            ))}
          </article>
        </div>
      </section>

      <section className="border-y border-[#24231f] bg-[#11110e] px-5 py-12 text-[#fffaf0] md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#dfb63f]">A practical reminder</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-[-0.035em] md:text-4xl">
              Review important messages before you send them.
            </h2>
          </div>
          <Link
            className="inline-flex w-fit border border-[#dfb63f] bg-[#dfb63f] px-6 py-3 font-semibold text-[#11110e] transition-colors hover:bg-[#f2df9c]"
            href="/workspace"
          >
            Open Workspace →
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#ddd4c2] bg-[#f7f1e3] px-5 py-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 text-sm md:flex-row md:items-center">
          <div>
            <p className="text-xl font-bold">ProPhrase</p>
            <p className="mt-1 text-[#756f62]">© 2026 ProPhrase. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold text-[#5f5a4f]">
            <button className="hover:text-[#11110e]" onClick={() => selectTab("privacy")} type="button">Privacy Policy</button>
            <button className="hover:text-[#11110e]" onClick={() => selectTab("terms")} type="button">Terms of Service</button>
            <Link className="hover:text-[#11110e]" href="/developers/api">Developer API</Link>
            <Link className="hover:text-[#11110e]" href="/support">Support</Link>
            <a className="hover:text-[#11110e]" href={`mailto:${LEGAL_EMAIL}`}>Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
