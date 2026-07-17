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
  currentBillingInterval,
  authenticated,
}: {
  plans: PublicPlan[];
  currentPlan: PlanId;
  currentBillingInterval: BillingInterval;
  authenticated: boolean;
}) {
  const [interval, setInterval] = useState<Exclude<BillingInterval, "none">>(
    currentBillingInterval === "annual" ? "annual" : "monthly",
  );
  useEffect(() => {
    trackBillingEvent("pricing_page_viewed", { authenticated, currentPlan });
  }, [authenticated, currentPlan]);
  return (
    <section className="pricing-plans-section" aria-label="ProPhrase plans">
      <div className="landing-shell">
        <div className="pricing-interval-wrap">
          <span>Billing cycle</span>
          <div className="pricing-interval" role="group" aria-label="Billing interval">
            {(["monthly", "annual"] as const).map((value) => (
              <button
                aria-pressed={interval === value}
                className={interval === value ? "is-active" : ""}
                key={value}
                onClick={() => {
                  setInterval(value);
                  trackBillingEvent("pricing_interval_changed", { billingInterval: value, currentPlan });
                }}
                type="button"
              >
                {value === "monthly" ? "Monthly" : "Annual"}
                {value === "annual" ? <small>Save more</small> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="pricing-plan-grid">
          {plans.map((plan) => {
            const paid = plan.id !== "free";
            const paidPlan = plan.id === "plus" || plan.id === "pro" ? plan.id : undefined;
            const price = interval === "monthly" ? plan.monthlyPricePaise : plan.annualPricePaise;
            const annualSaving = plan.monthlyPricePaise && plan.annualPricePaise
              ? plan.monthlyPricePaise * 12 - plan.annualPricePaise : 0;
            const current = plan.id === "free"
              ? currentPlan === "free"
              : currentPlan === plan.id && currentBillingInterval === interval;
            const proToPlus = currentPlan === "pro" && plan.id === "plus";

            return (
              <article
                className={`pricing-plan-card pricing-plan-card-${plan.id}${current ? " is-current" : ""}`}
                id={`plan-${plan.id}`}
                key={plan.id}
              >
                <div className="pricing-plan-heading">
                  <div>
                    <span className="pricing-plan-index">0{plans.findIndex((item) => item.id === plan.id) + 1}</span>
                    <h2>{plan.publicName}</h2>
                  </div>
                  {plan.id === "plus" ? <span className="pricing-plan-badge">Most popular</span> : null}
                  {current ? <span className="pricing-current-badge">Your plan</span> : null}
                </div>

                <p className="pricing-plan-description">{plan.description}</p>

                <div className="pricing-plan-price">
                  <strong>{paid && price ? formatInrFromPaise(price) : "₹0"}</strong>
                  <span>{paid ? (interval === "monthly" ? "/ month" : "/ year") : "forever"}</span>
                </div>

                <div className="pricing-credit-badge">
                  <span aria-hidden="true">✦</span>
                  {plan.dailyCredits ? `${plan.dailyCredits} credits every day` : `${plan.monthlyCredits} credits refreshed monthly`}
                </div>

                {interval === "annual" && annualSaving > 0 ? (
                  <p className="pricing-saving">You save {formatInrFromPaise(annualSaving)} each year</p>
                ) : null}

                <div className="pricing-plan-divider" />
                <p className="pricing-includes">What&apos;s included</p>
                <ul className="pricing-feature-list">
                  {features[plan.id].map((feature) => (
                    <li key={feature}><span aria-hidden="true">✓</span><span>{feature}</span></li>
                  ))}
                  <li><span aria-hidden="true">✓</span><span>Up to {plan.maxInputCharacters.toLocaleString("en-IN")} characters</span></li>
                </ul>

                <PricingActionButton
                  className={`pricing-plan-action${current ? " is-current" : ""}`}
                  current={current}
                  currentPlan={currentPlan}
                  interval={paid ? interval : "none"}
                  plan={paidPlan}
                >
                  {paid ? proToPlus ? "Schedule Plus" : `Choose ${plan.publicName}` : "Start free"}
                </PricingActionButton>
                <p className="pricing-plan-fineprint">
                  {proToPlus
                    ? `${plan.monthlyCredits?.toLocaleString("en-IN")} credits refresh monthly. Starts at renewal; UPI/eMandate uses a refundable ₹5 mandate check.`
                    : paid && currentPlan !== "free" && !current
                      ? "Upgrades are prorated now. Other changes start at renewal. UPI/eMandate may use a refundable ₹5 mandate check."
                    : "Longer messages use more credits."}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
