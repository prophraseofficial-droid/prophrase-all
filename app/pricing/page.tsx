import Link from "next/link";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PricingPlans } from "@/components/billing/PricingPlans";
import { publicPlanCatalog } from "@/lib/billing/catalog";
import type { BillingInterval, PlanId } from "@/lib/billing/types";
import { getBillingAccount } from "@/lib/billing/account";
import { getCurrentUser } from "@/lib/supabase/server";
import { getBillingFlags } from "@/lib/billing/flags";
import { notFound } from "next/navigation";

function mapLegacyPlan(plan?: string | null): PlanId {
  if (plan === "plus" || plan === "pro") return plan;
  if (plan === "pro_monthly" || plan === "pro_yearly") return "plus";
  return "free";
}

export default async function PricingPage() {
  if (!getBillingFlags().pricingPageEnabled) notFound();
  const user = await getCurrentUser();
  let currentPlan: PlanId = "free";
  let currentBillingInterval: BillingInterval = "none";
  if (user) {
    try {
      const account = await getBillingAccount(user.id);
      currentPlan = mapLegacyPlan(account.plan);
      currentBillingInterval = account.billingInterval;
    } catch {
      currentPlan = "free";
      currentBillingInterval = "none";
    }
  }
  const isAuthenticated = Boolean(user);
  const appHref = isAuthenticated ? "/workspace" : "/login";

  return (
    <main className="landing-page pricing-page" id="top">
      <LandingHeader appHref={appHref} isAuthenticated={isAuthenticated} />

      <section className="pricing-hero">
        <div className="landing-shell pricing-hero-inner">
          <span className="landing-eyebrow pricing-eyebrow">
            <span aria-hidden="true">✦</span>
            Start with 15 free credits every day
          </span>
          <h1>Simple plans.<br />Better messages.</h1>
          <p>Choose the writing support you need today. Move up only when ProPhrase becomes part of your everyday workflow.</p>
          <div className="pricing-proof" aria-label="Plan highlights">
            <span>No card for Free</span>
            <span>Credits shared across workspace and extension</span>
            <span>Cancel anytime</span>
          </div>
        </div>
      </section>

      <PricingPlans
        authenticated={isAuthenticated}
        currentBillingInterval={currentBillingInterval}
        currentPlan={currentPlan}
        plans={publicPlanCatalog()}
      />

      <section className="pricing-credit-section" aria-labelledby="credits-heading">
        <div className="landing-shell pricing-credit-grid">
          <div className="pricing-credit-copy">
            <span className="section-kicker">Clear usage</span>
            <h2 id="credits-heading">You only spend credits when ProPhrase delivers.</h2>
            <p>Credits are charged after a successful generation. Failed generations use no credits, and the same balance follows you across the workspace and browser extension.</p>
            <div className="pricing-credit-notes">
              <strong>Unused credits do not roll over.</strong>
              <span>Taxes may apply at checkout.</span>
            </div>
          </div>
          <dl className="pricing-credit-table">
            {[
              ["1–500 characters", "1 credit"],
              ["501–1,200 characters", "2 credits"],
              ["1,201–2,500 characters", "4 credits"],
              ["2,501–5,000 characters", "8 credits"],
            ].map(([range, cost], index) => (
              <div key={range}>
                <span aria-hidden="true">0{index + 1}</span>
                <dt>{range}</dt>
                <dd>{cost}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="pricing-bottom-cta">
        <div className="landing-shell">
          <div className="pricing-bottom-card">
            <div>
              <span>Start rough. Upgrade later.</span>
              <h2>Try the complete writing flow before you pay.</h2>
            </div>
            <Link className="landing-button landing-button-gold" href={appHref}>
              {isAuthenticated ? "Open Workspace" : "Start free"}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
