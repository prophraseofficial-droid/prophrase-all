import { PublicHeader } from "@/components/PublicHeader";
import { PricingPlans } from "@/components/billing/PricingPlans";
import { publicPlanCatalog } from "@/lib/billing/catalog";
import type { PlanId } from "@/lib/billing/types";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/usage/usage";
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
  if (user) {
    try { currentPlan = mapLegacyPlan((await getUserPlan(user.id)).plan); } catch { currentPlan = "free"; }
  }
  const metadata = user?.user_metadata ?? {};
  const userName = typeof metadata.full_name === "string" ? metadata.full_name
    : typeof metadata.name === "string" ? metadata.name : user?.email?.split("@")[0] || "";
  return (
    <main className="min-h-screen bg-surface text-primary">
      <PublicHeader
        active="pricing"
        ctaLabel={user ? "Workspace" : "Try free"}
        isAuthenticated={Boolean(user)}
        userEmail={user?.email ?? ""}
        userName={userName}
      />
      <div className="pb-20 pt-32">
        <section className="mx-auto mb-10 max-w-container px-5 text-center md:px-10">
          <h1 className="mx-auto max-w-4xl text-[44px] font-bold leading-[48px] md:text-[68px] md:leading-[72px]">Simple pricing for better work messages.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-7 text-text-muted">Choose a credit allowance and feature set that fits how often you communicate at work.</p>
        </section>
        <PricingPlans authenticated={Boolean(user)} currentPlan={currentPlan} plans={publicPlanCatalog()} />
        <section className="mx-auto max-w-4xl px-5 md:px-10" aria-labelledby="credits-heading">
          <div className="rounded-[24px] border border-border-subtle bg-white p-8">
            <h2 className="text-2xl font-semibold" id="credits-heading">How credits work</h2>
            <p className="mt-2 text-text-muted">Credits are charged only after a successful generation. Failed generations use no credits.</p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {[['1–500 characters','1 credit'],['501–1,200 characters','2 credits'],['1,201–2,500 characters','4 credits'],['2,501–5,000 characters','8 credits']].map(([range,cost]) => <div className="flex justify-between border-b border-border-subtle pb-3" key={range}><dt>{range}</dt><dd className="font-semibold">{cost}</dd></div>)}
            </dl>
            <p className="mt-6 text-sm font-semibold">Unused credits do not roll over.</p>
            <p className="mt-2 text-sm text-text-muted">Taxes may apply at checkout.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
