import type { Metadata } from "next";
import Link from "next/link";
import { AuthAwareLandingHeader } from "@/components/landing/AuthAwareLandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

const SUPPORT_EMAIL = "privacy@prophrase.in";

export const metadata: Metadata = {
  title: "Support | ProPhrase",
  description:
    "Get help with ProPhrase, the browser extension, Universal Copy, credits, billing, privacy and account access.",
};

type FaqItem = {
  question: string;
  answer: React.ReactNode;
};

type FaqGroup = {
  id: string;
  label: string;
  title: string;
  description: string;
  items: FaqItem[];
};

const faqGroups: FaqGroup[] = [
  {
    id: "getting-started",
    label: "Getting started",
    title: "Using ProPhrase",
    description: "The essentials for writing, rewriting and finding your saved work.",
    items: [
      {
        question: "What is ProPhrase?",
        answer:
          "ProPhrase is an AI-assisted communication workspace that turns rough text into clear, ready-to-send messages. You can choose a Quick Style, guide the rewrite toward an outcome, use the browser extension on supported pages and continue across devices with Universal Copy.",
      },
      {
        question: "How do I rewrite a message?",
        answer:
          "Open the ProPhrase workspace, paste or type your draft, choose a style or provide the outcome you want, and generate a version. Review the result before copying or sending it—AI output can be incomplete or inaccurate.",
      },
      {
        question: "Where can I find my previous messages?",
        answer:
          "Signed-in workspace activity appears in your message history. Browser-local history and saved workspace threads are separate, so clearing browser storage may remove items stored only on that device.",
      },
      {
        question: "Can I use ProPhrase for sensitive information?",
        answer:
          "Do not submit passwords, payment credentials, one-time codes, regulated records, trade secrets or information you are not authorized to share. ProPhrase sends the content needed for a requested rewrite to its AI provider.",
      },
    ],
  },
  {
    id: "extension",
    label: "Browser extension",
    title: "Chrome and Firefox",
    description: "Install, connect and troubleshoot ProPhrase in your browser.",
    items: [
      {
        question: "How do I connect the extension to my account?",
        answer:
          "Sign in at prophrase.in, open the ProPhrase extension and choose Connect or Sign in. Complete the connection in the ProPhrase tab that opens, then return to the extension. Only connect browsers and devices you trust.",
      },
      {
        question: "Why does the extension say it is not connected?",
        answer:
          "Your connection may have expired, been revoked or been cleared with browser data. Sign in to ProPhrase, reconnect the extension and retry. If the problem continues, remove and reinstall the extension, then connect it again.",
      },
      {
        question: "Why is selected text not detected?",
        answer:
          "Select editable text on the active page before opening ProPhrase. Some browser-protected pages, extension stores, internal browser pages and heavily customized editors prevent extensions from reading or replacing selected text. Copy the text into the extension or workspace when direct selection is unavailable.",
      },
      {
        question: "The extension is installed but I cannot see it. What should I do?",
        answer:
          "Open your browser’s extensions menu and pin ProPhrase to the toolbar. Confirm the extension is enabled, refresh the page you want to use and reopen ProPhrase. Browser-protected pages will still block extension access.",
      },
    ],
  },
  {
    id: "universal-copy",
    label: "Universal Copy",
    title: "Continue across devices",
    description: "Make copied text briefly available to another signed-in ProPhrase device.",
    items: [
      {
        question: "How does Universal Copy work?",
        answer:
          "Send text from one signed-in ProPhrase device, then claim it from another device using the same account. A copy is normally available for 10 minutes and may be claimed once.",
      },
      {
        question: "Why did my copied text disappear?",
        answer:
          "The copy may have expired, already been claimed, been replaced or become unavailable during a network interruption. Send the text again from the source device and claim it while it is available.",
      },
      {
        question: "Is Universal Copy a secure vault or password manager?",
        answer:
          "No. Universal Copy is a convenience feature and is not an end-to-end encrypted password manager, permanent archive or backup service. Never use it for passwords, payment details, one-time codes or other highly sensitive information.",
      },
    ],
  },
  {
    id: "credits-billing",
    label: "Credits and billing",
    title: "Plans, credits and renewals",
    description: "Understand usage, credit refreshes, plan changes and subscription status.",
    items: [
      {
        question: "When are credits charged?",
        answer:
          "ProPhrase estimates the credit cost before an eligible request and deducts credits for successful operations. Your account billing page shows the current balance, usage, reserved credits and refresh date.",
      },
      {
        question: "Do unused credits roll over?",
        answer:
          "Plan credits normally reset or expire on the refresh date shown in your account and do not roll over unless the plan description explicitly says otherwise. Your billing page is the source of truth for your current cycle.",
      },
      {
        question: "What happens when I cancel autopay?",
        answer:
          "Cancellation normally stops the next renewal. Your current paid plan and remaining credits continue through the end date displayed on the billing page, after which the account moves to the available free access unless another plan is active.",
      },
      {
        question: "What happens to a scheduled plan change after cancellation?",
        answer:
          "A scheduled plan choice will not renew while autopay is ending. The billing card continues to show the cancelled renewal information until the paid period finishes. Resume autopay before the end date if you want to restore the scheduled renewal.",
      },
      {
        question: "Why did Razorpay show a small authorization amount?",
        answer:
          "Razorpay may request a small refundable authorization when creating or reauthorizing an automatic-payment mandate. The checkout should identify the amount as refundable; it is separate from the recurring plan price.",
      },
    ],
  },
  {
    id: "account-privacy",
    label: "Account and privacy",
    title: "Your account and data",
    description: "Security, privacy choices and account requests.",
    items: [
      {
        question: "How do I protect my account?",
        answer:
          "Use a trusted sign-in account, keep your browser profile and devices secured, and revoke extension or API tokens you no longer use. Reconnect the extension if you believe a token or device was compromised.",
      },
      {
        question: "Does ProPhrase sell my personal data?",
        answer: (
          <>
            No. ProPhrase does not sell personal data. Read the full details in the{" "}
            <Link className="font-semibold underline underline-offset-4" href="/legal#privacy">
              Privacy Policy
            </Link>
            .
          </>
        ),
      },
      {
        question: "How can I request access, correction or deletion of my data?",
        answer: (
          <>
            Email{" "}
            <a className="font-semibold underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address associated with your account. ProPhrase may need to verify your identity before completing the request and may retain limited records where required by law.
          </>
        ),
      },
      {
        question: "Where can developers find API documentation?",
        answer: (
          <>
            Visit the{" "}
            <Link className="font-semibold underline underline-offset-4" href="/developers/api">
              Developer API page
            </Link>{" "}
            for authentication, endpoints, examples, rate limits and credit behavior. Never expose an API token in public client code.
          </>
        ),
      },
    ],
  },
];

function Arrow() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
      <path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function FaqGroupSection({ group }: { group: FaqGroup }) {
  return (
    <section className="scroll-mt-28 border-t border-[#d9cfbb] py-12 first:border-t-0 first:pt-0 md:py-16" id={group.id}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6b18]">{group.label}</p>
      <div className="mt-3 grid gap-7 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-14">
        <div>
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-[-0.04em] text-[#11110e] md:text-[42px]">
            {group.title}
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-[#686255]">{group.description}</p>
        </div>
        <div className="border-t border-[#cfc3aa]">
          {group.items.map((item) => (
            <details className="group border-b border-[#cfc3aa]" key={item.question}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 py-6 text-lg font-semibold leading-7 text-[#11110e] marker:content-none md:text-xl">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center border border-[#b8aa8d] text-xl font-normal transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="max-w-2xl pb-7 pr-12 text-base leading-7 text-[#5f5a4f]">{item.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <main className="landing-page min-h-screen bg-[#f7f1e3] text-[#11110e]">
      <AuthAwareLandingHeader />

      <section className="border-b border-[#d9cfbb] px-5 pb-16 pt-32 md:px-10 md:pb-24 md:pt-40">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a6b18]">ProPhrase Support</p>
          <div className="mt-5 grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
            <div>
              <h1 className="max-w-4xl text-[50px] font-bold leading-[0.95] tracking-[-0.06em] md:text-[82px]">
                How can we help?
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#686255] md:text-xl">
                Find answers about ProPhrase, the browser extension, Universal Copy, credits, billing and your account.
              </p>
            </div>
            <div className="border border-[#11110e] bg-[#11110e] p-6 text-[#fffaf0] md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#dfb63f]">Need more help?</p>
              <p className="mt-3 text-xl font-bold leading-7">Tell us what happened and what you expected.</p>
              <a
                className="mt-6 inline-flex items-center gap-2 border border-[#dfb63f] bg-[#dfb63f] px-5 py-3 text-sm font-semibold text-[#11110e] transition-colors hover:bg-[#f2df9c]"
                href={`mailto:${SUPPORT_EMAIL}?subject=ProPhrase%20support%20request`}
              >
                Email support <Arrow />
              </a>
            </div>
          </div>
        </div>
      </section>

      <nav className="border-b border-[#d9cfbb] bg-[#f0e3bd] px-5 py-5 md:px-10" aria-label="Support topics">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2">
          {faqGroups.map((group) => (
            <a
              className="border border-[#b8aa8d] bg-[#fffaf0] px-4 py-2.5 text-sm font-semibold text-[#5f5a4f] transition-colors hover:border-[#11110e] hover:bg-[#11110e] hover:text-[#fffaf0]"
              href={`#${group.id}`}
              key={group.id}
            >
              {group.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="px-5 py-14 md:px-10 md:py-20">
        <div className="mx-auto max-w-6xl">
          {faqGroups.map((group) => (
            <FaqGroupSection group={group} key={group.id} />
          ))}
        </div>
      </section>

      <section className="border-y border-[#24231f] bg-[#11110e] px-5 py-12 text-[#fffaf0] md:px-10 md:py-16">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#dfb63f]">Still need assistance?</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-[-0.04em] md:text-4xl">
              Include your browser, device and the steps that caused the problem.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-[#c9c4b8]">
              Do not email passwords, payment credentials, API tokens or sensitive writing content.
            </p>
          </div>
          <a
            className="inline-flex w-fit items-center gap-2 border border-[#dfb63f] bg-[#dfb63f] px-6 py-3 font-semibold text-[#11110e] transition-colors hover:bg-[#f2df9c]"
            href={`mailto:${SUPPORT_EMAIL}?subject=ProPhrase%20support%20request`}
          >
            Contact support <Arrow />
          </a>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
