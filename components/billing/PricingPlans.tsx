"use client";

import { useEffect, useState } from "react";
import { PricingActionButton } from "@/components/billing/PricingActionButton";
import { formatInrFromPaise } from "@/lib/billing/format";
import type { BillingInterval, PlanId } from "@/lib/billing/types";
import { trackBillingEvent } from "@/lib/billing/analytics";

type PublicPlan = {
  id: PlanId;
  publicName: string;
  description: string;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  dailyCredits: number | null;
  monthlyCredits: number | null;
  maxInputCharacters: number;
};

const features: Record<PlanId, string[]> = {
  free: ["Core rephrasing", "Professional, Polite and Shorter tones", "Safe, Balanced and Firm messages", "Credits refresh daily"],
  plus: ["Everything in Free", "All tones and work-message modes", "Full Outcome Assistant", "Voice input and risk checks", "Up to 30 days of history", "Up to 3 saved presets"],
  pro: ["Everything in Plus", "Saved personal style", "Advanced personalization", "Extended history", "Priority generation where supported", "Up to 20 saved presets"],
};

export function PricingPlans({
  plans,
  currentPlan,
  authenticated,
}: {
  plans: PublicPlan[];
  currentPlan: PlanId;
  authenticated: boolean;
}) {
  const [interval, setInterval] = useState<Exclude<BillingInterval, "none">>("monthly");
  useEffect(() => {
    trackBillingEvent("pricing_page_viewed", { authenticated, currentPlan });
  }, [authenticated, currentPlan]);
  return (
    <>
      <div className="mx-auto mb-10 flex w-fit rounded-full border border-border-subtle bg-white p-1" role="group" aria-label="Billing interval">
        {(["monthly", "annual"] as const).map((value) => (
          <button
            aria-pressed={interval === value}
            className={interval === value ? "rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white" : "rounded-full px-5 py-2.5 text-sm font-semibold text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"}
            key={value}
            onClick={() => {
              setInterval(value);
              trackBillingEvent("pricing_interval_changed", { billingInterval: value, currentPlan });
            }}
            type="button"
          >
            {value === "monthly" ? "Monthly" : "Annual"}
          </button>
        ))}
      </div>
      <section className="mx-auto mb-16 grid max-w-container grid-cols-1 gap-6 px-5 md:grid-cols-3 md:px-10" aria-label="ProPhrase plans">
        {plans.map((plan) => {
          const paid = plan.id !== "free";
          const paidPlan = plan.id === "plus" || plan.id === "pro" ? plan.id : undefined;
          const price = interval === "monthly" ? plan.monthlyPricePaise : plan.annualPricePaise;
          const annualSaving = plan.monthlyPricePaise && plan.annualPricePaise
            ? plan.monthlyPricePaise * 12 - plan.annualPricePaise : 0;
          const current = currentPlan === plan.id;
          return (
            <article className={plan.id === "plus" ? "premium-shadow relative flex flex-col rounded-[24px] border-2 border-primary bg-white p-8" : "premium-shadow flex flex-col rounded-[24px] border border-border-subtle bg-white p-8"} key={plan.id}>
              {plan.id === "plus" ? <span className="absolute -top-4 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">Recommended</span> : null}
              <h2 className="text-3xl font-semibold text-primary">{plan.publicName}</h2>
              <p className="mt-2 min-h-12 text-text-muted">{plan.description}</p>
              <div className="mt-7">
                <span className="text-[40px] font-semibold leading-[48px]">{paid && price ? formatInrFromPaise(price) : "₹0"}</span>
                <span className="ml-1 text-text-muted">{paid ? (interval === "monthly" ? "/month" : "/year") : ""}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-primary">
                {plan.dailyCredits ? `${plan.dailyCredits} credits every day` : `${plan.monthlyCredits} credits refreshed monthly`}
              </p>
              {interval === "annual" && annualSaving > 0 ? <p className="mt-1 text-sm text-green-800">Save {formatInrFromPaise(annualSaving)} per year</p> : null}
              <ul className="my-8 flex-1 space-y-3">
                {features[plan.id].map((feature) => <li className="flex gap-3 text-sm" key={feature}><span aria-hidden="true">✓</span><span>{feature}</span></li>)}
                <li className="flex gap-3 text-sm"><span aria-hidden="true">✓</span><span>Up to {plan.maxInputCharacters.toLocaleString("en-IN")} characters</span></li>
              </ul>
              <PricingActionButton
                className={current ? "w-full rounded-full border border-border-subtle py-4 text-sm font-semibold text-text-muted" : "w-full rounded-full bg-primary py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"}
                current={current}
                currentPlan={currentPlan}
                interval={paid ? interval : "none"}
                plan={paidPlan}
              >
                {paid ? `Choose ${plan.publicName}` : "Start free"}
              </PricingActionButton>
              <p className="mt-4 text-center text-xs text-text-muted">Longer messages use more credits.</p>
            </article>
          );
        })}
      </section>
    </>
  );
}
