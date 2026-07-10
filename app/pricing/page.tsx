import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PricingActionButton } from "@/components/billing/PricingActionButton";
import { getCurrentUser } from "@/lib/supabase/server";

const plans = [
  {
    name: "Starter",
    title: "Free",
    description: "Perfect for trying out.",
    price: "₹0",
    cadence: "/forever",
    features: ["5 rewrites per day", "Basic AI suggestions"],
    unavailable: ["Unlimited rewrites"],
    button: "Start for free",
    billingPlan: undefined,
  },
  {
    name: "Professional",
    title: "Monthly",
    badge: "Most flexible",
    description: "Power for focused months.",
    price: "₹99",
    cadence: "/month",
    features: ["Unlimited rewrites", "Voice input integration", "Saved templates"],
    button: "Go Pro",
    billingPlan: "pro_monthly" as const,
    emphasized: true,
  },
  {
    name: "Professional",
    title: "Yearly",
    badges: ["Best Value", "Save 41%"],
    description: "Maximum clarity, best price.",
    price: "₹699",
    cadence: "/year",
    note: "Billed annually (₹58/mo)",
    features: ["Priority AI features", "Unlimited rewrites", "All platform access"],
    button: "Get the Year Plan",
    billingPlan: "pro_yearly" as const,
    premium: true,
  },
];

const comparisons = [
  ["Daily Rewrites", "5", "Unlimited"],
  ["Voice to Text", "—", "check"],
  ["Saved Templates", "—", "check"],
  ["Draft History", "24 hours", "Forever"],
  ["Tone Customization", "Basic", "Advanced"],
];

const faqs = [
  {
    question: "Unlimited fair-use policy",
    answer:
      "Pro users enjoy unlimited rewrites subject to our fair-use policy. This ensures optimal performance for everyone. It's effectively unlimited for individual human use.",
  },
  {
    question: "Is the yearly plan worth it?",
    answer:
      "Absolutely. By choosing the yearly plan, you save 41% compared to the monthly subscription, bringing the cost down to just ₹58/mo. It's our most popular choice for professionals.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time from your account settings. You'll retain access to Pro features until the end of your current billing period.",
  },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    check: (
      <>
        <path d="m20 6-11 11-5-5" />
      </>
    ),
    close: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6" />
        <path d="m15 9-6 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
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

export default async function PricingPage() {
  const user = await getCurrentUser();
  const isAuthenticated = Boolean(user);
  const userName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user?.email?.split("@")[0] || "";

  return (
    <main className="bg-surface text-[#1a1c1a]">
      <PublicHeader
        active="pricing"
        ctaLabel={isAuthenticated ? "Workspace" : "Try free"}
        isAuthenticated={isAuthenticated}
        userEmail={user?.email ?? ""}
        userName={userName}
      />

      <div className="pb-16 pt-32">
        <section className="mx-auto mb-16 max-w-container px-5 text-center md:px-10">
          <h1 className="mx-auto mb-4 max-w-3xl text-[44px] font-bold leading-[48px] tracking-[-0.03em] text-primary md:text-[72px] md:leading-[76px] md:tracking-[-0.04em]">
            Simple pricing for better work messages.
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-7 text-text-muted">
            Invest in clarity. Choose the plan that helps you communicate with
            confidence and precision every single day.
          </p>
        </section>

        <section className="mx-auto mb-16 grid max-w-container grid-cols-1 gap-6 px-5 md:grid-cols-3 md:px-10">
          {plans.map((plan) => (
            <div
              className={
                plan.premium
                  ? "gradient-border-pro premium-shadow premium-shadow-hover relative z-0 flex flex-col rounded-[24px] p-8 transition-all"
                  : "premium-shadow premium-shadow-hover flex flex-col rounded-[24px] border border-border-subtle bg-white p-8 transition-all"
              }
              key={plan.title}
            >
              <div className="relative mb-8">
                {plan.badge ? (
                  <span className="absolute -top-12 left-0 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold leading-4 text-[#1a1c1a]">
                    {plan.badge}
                  </span>
                ) : null}
                {plan.badges ? (
                  <div className="absolute -top-12 left-0 flex gap-2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold leading-4 text-on-primary">
                      {plan.badges[0]}
                    </span>
                    <span className="rounded-full border border-primary bg-white px-3 py-1 text-xs font-semibold leading-4 text-primary shadow-sm">
                      {plan.badges[1]}
                    </span>
                  </div>
                ) : null}
                <span className="text-xs font-semibold uppercase leading-4 tracking-[0.18em] text-text-muted">
                  {plan.name}
                </span>
                <h3 className="mt-2 text-[40px] font-semibold leading-[48px] tracking-[-0.02em]">
                  {plan.title}
                </h3>
                <p className="mt-2 text-text-muted">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline">
                  <span className="text-[40px] font-semibold leading-[48px] tracking-[-0.02em]">
                    {plan.price}
                  </span>
                  <span className="ml-1 text-text-muted">{plan.cadence}</span>
                </div>
                {plan.note ? (
                  <p className="mt-2 text-sm font-medium leading-5 text-primary/70">
                    {plan.note}
                  </p>
                ) : null}
              </div>

              <ul className="mb-8 flex-grow space-y-4">
                {plan.features.map((feature, index) => (
                  <li className="flex items-center gap-3" key={feature}>
                    <Icon
                      className={
                        plan.premium && index === 0
                          ? "text-xl text-ai-purple"
                          : "text-xl text-primary"
                      }
                      name={plan.premium && index === 0 ? "spark" : "check"}
                    />
                    <span
                      className={
                        plan.premium && index === 0
                          ? "text-sm font-semibold leading-5"
                          : "text-sm font-medium leading-5"
                      }
                    >
                      {feature}
                    </span>
                  </li>
                ))}
                {plan.unavailable?.map((feature) => (
                  <li className="flex items-center gap-3 text-text-muted/50" key={feature}>
                    <Icon className="text-xl" name="close" />
                    <span className="text-sm font-medium leading-5 line-through">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <PricingActionButton
                className={
                  plan.emphasized || plan.premium
                    ? "w-full rounded-full bg-primary py-4 text-center text-sm font-medium leading-5 text-on-primary transition-all hover:opacity-90 active:scale-95"
                    : "w-full rounded-full border border-border-subtle py-4 text-center text-sm font-medium leading-5 transition-colors hover:bg-surface-container"
                }
                plan={plan.billingPlan}
              >
                {plan.button}
              </PricingActionButton>
            </div>
          ))}
        </section>

        <section className="mx-auto mb-16 max-w-[900px] px-5 md:px-10">
          <div className="group relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-container-low p-8">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="space-y-2">
                <h4 className="text-2xl font-semibold leading-8 tracking-[-0.01em]">
                  Daily Usage
                </h4>
                <p className="text-text-muted">
                  You are currently on the Starter plan.
                </p>
              </div>
              <div className="w-full space-y-3 md:w-64">
                <div className="flex justify-between text-sm font-medium leading-5">
                  <span>Rewrites used</span>
                  <span className="font-bold">5 / 5</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div className="h-full w-full bg-primary" />
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
              <div className="glass premium-shadow max-w-md scale-95 rounded-[24px] border border-white p-8 text-center transition-transform group-hover:scale-100">
                <Icon className="mb-2 text-[40px] text-[#ba1a1a]" name="lock" />
                <h3 className="mb-2 text-2xl font-semibold leading-8 tracking-[-0.01em]">
                  Limit Reached
                </h3>
                <p className="mb-4 text-text-muted">
                  You&apos;ve used your free rewrites for today. Upgrade to Pro
                  to continue refining your messages without limits.
                </p>
                <Link
                  className="inline-flex rounded-full bg-primary px-8 py-3 text-sm font-medium leading-5 text-on-primary transition-all hover:opacity-80"
                  href="/workspace"
                >
                  Upgrade Now
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mb-16 max-w-container overflow-x-auto px-5 md:px-10">
          <h2 className="mb-8 text-center text-[40px] font-semibold leading-[48px] tracking-[-0.02em]">
            Compare features
          </h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="w-1/2 py-6 text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-text-muted">
                  Feature
                </th>
                <th className="py-6 text-center text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-text-muted">
                  Free
                </th>
                <th className="py-6 text-center text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-text-muted">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody className="text-base leading-6">
              {comparisons.map(([feature, free, pro]) => (
                <tr
                  className="border-b border-border-subtle transition-colors hover:bg-surface-container-low"
                  key={feature}
                >
                  <td className="py-6 font-medium">{feature}</td>
                  <td className="py-6 text-center text-text-muted">{free}</td>
                  <td className="py-6 text-center font-bold">
                    {pro === "check" ? (
                      <Icon className="text-2xl text-primary" name="check" />
                    ) : (
                      pro
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mx-auto mb-16 max-w-[800px] px-5 md:px-10">
          <h2 className="mb-8 text-center text-[40px] font-semibold leading-[48px] tracking-[-0.02em]">
            Common Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <details
                className="group cursor-pointer border-b border-border-subtle pb-4"
                key={faq.question}
                open
              >
                <summary className="flex list-none items-center justify-between text-2xl font-semibold leading-8 tracking-[-0.01em] group-open:text-primary">
                  <span>{faq.question}</span>
                  <Icon
                    className="text-2xl transition-transform group-open:rotate-180"
                    name="chevron"
                  />
                </summary>
                <p className="mt-4 text-base leading-6 text-text-muted">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-container rounded-[48px] bg-surface-container-low px-5 py-20 text-center md:px-10">
          <h2 className="mx-auto mb-8 max-w-2xl text-[44px] font-bold leading-[48px] tracking-[-0.03em] md:text-[72px] md:leading-[76px] md:tracking-[-0.04em]">
            Ready to make every work message clearer?
          </h2>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              className="rounded-full bg-primary px-10 py-4 text-sm font-medium leading-5 text-on-primary transition-all hover:opacity-90 active:scale-95"
              href="/workspace"
            >
              Upgrade to Pro
            </Link>
            <Link
              className="rounded-full border border-border-subtle bg-white px-10 py-4 text-sm font-medium leading-5 transition-colors hover:bg-surface-container"
              href="/workspace"
            >
              Start for free
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium leading-5 text-text-muted">
            No credit card required to start free.
          </p>
        </section>
      </div>

      <footer className="border-t border-border-subtle bg-surface py-16">
        <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-6 px-5 md:flex-row md:px-10">
          <Link
            className="flex items-center gap-4"
            href={isAuthenticated ? "/workspace" : "/"}
          >
            <Image
              src="/prophrase-logo.png"
              alt="ProPhrase"
              width={24}
              height={24}
              className="h-6 w-6 rounded object-cover opacity-80"
            />
            <span className="text-2xl font-semibold leading-8 tracking-[-0.01em] text-primary opacity-80">
              ProPhrase
            </span>
          </Link>
          <div className="flex flex-wrap justify-center gap-8 text-base leading-6 text-text-muted">
            <Link className="transition-colors hover:text-primary" href="/legal">
              Privacy Policy
            </Link>
            <Link className="transition-colors hover:text-primary" href="/legal">
              Terms of Service
            </Link>
            <Link className="transition-colors hover:text-primary" href="/legal">
              Contact Support
            </Link>
          </div>
          <p className="text-base leading-6 text-text-muted">
            © 2024 ProPhrase. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
