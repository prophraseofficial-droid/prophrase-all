"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreditBalance } from "@/lib/billing/types";
import { trackBillingEvent } from "@/lib/billing/analytics";
import { classifyPlanChange } from "@/lib/billing/plan-change";

type Account = {
  plan: "free" | "plus" | "pro";
  billingInterval: "none" | "monthly" | "annual";
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: "plus" | "pro" | null;
  pendingBillingInterval: "monthly" | "annual" | null;
  planChangeEffectiveAt: string | null;
};

export function BillingAccountClient({ account, balance }: { account: Account; balance: CreditBalance }) {
  const [current, setCurrent] = useState(account);
  const [creditBalance, setCreditBalance] = useState(balance);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const planName = current.plan === "free" ? "Free" : current.plan === "plus" ? "Plus" : "Pro";
  const pendingPlanName = current.pendingPlan === "plus" ? "Plus" : current.pendingPlan === "pro" ? "Pro" : null;
  const pendingChangeTiming =
    current.plan !== "free" && current.billingInterval !== "none" &&
    current.pendingPlan && current.pendingBillingInterval
      ? classifyPlanChange(
          { plan: current.plan, interval: current.billingInterval },
          { plan: current.pendingPlan, interval: current.pendingBillingInterval },
        )
      : null;
  const refreshDate = creditBalance.nextRefreshAt
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(creditBalance.nextRefreshAt))
    : "Not scheduled";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan_change") !== "processing") return;
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function refreshUpgrade() {
      attempts += 1;
      try {
        const response = await fetch("/api/billing/subscription-status", {
          cache: "no-store",
        });
        const data = await response.json() as Account & { balance?: CreditBalance };
        if (response.ok && !stopped) {
          setCurrent(data);
          if (data.balance) setCreditBalance(data.balance);
          if (!data.pendingPlan || attempts >= 30) return;
        }
      } catch {
        // A transient poll failure should not hide an upgrade confirmed moments later.
      }
      if (!stopped && attempts < 30) {
        timeoutId = setTimeout(() => void refreshUpgrade(), 1_000);
      }
    }

    void refreshUpgrade();
    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  async function mutate(path: "/api/billing/cancel" | "/api/billing/resume") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST" });
      const data = await response.json() as { message?: string; effectiveAt?: string };
      if (!response.ok) throw new Error(data.message || "Unable to update subscription.");
      const canceled = path.endsWith("cancel");
      setCurrent((value) => ({ ...value, cancelAtPeriodEnd: canceled }));
      trackBillingEvent(canceled ? "subscription_canceled" : "subscription_resumed", {
        currentPlan: current.plan,
        billingInterval: current.billingInterval,
      });
      setMessage(canceled
        ? `Your ${planName} plan remains active until ${data.effectiveAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(data.effectiveAt)) : "the end of the paid period"}.`
        : "Your subscription will continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update subscription.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-10 text-primary md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-text-muted">Account</p><h1 className="text-4xl font-bold">Billing and credits</h1></div>
          <Link className="rounded-full border border-border-subtle bg-white px-5 py-3 text-sm font-semibold" href="/workspace">Back to workspace</Link>
        </div>
        <section className="grid gap-6 md:grid-cols-2" aria-label="Billing summary">
          <div className="rounded-[24px] border border-border-subtle bg-white p-7">
            <p className="text-xs font-semibold uppercase text-text-muted">Current plan</p>
            <h2 className="mt-2 text-3xl font-semibold">{planName}</h2>
            <p className="mt-2 text-sm text-text-muted">{current.billingInterval === "none" ? "No paid subscription" : `${current.billingInterval} billing · ${current.subscriptionStatus.replaceAll("_", " ")}`}</p>
            {current.currentPeriodEnd ? <p className="mt-4 text-sm">Current access through {new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(current.currentPeriodEnd))}</p> : null}
            {pendingPlanName && current.pendingBillingInterval ? (
              <p className="mt-4 border border-border-subtle bg-surface px-4 py-3 text-sm" role="status">
                {pendingPlanName} · {current.pendingBillingInterval} is {pendingChangeTiming === "cycle_end" && current.planChangeEffectiveAt
                  ? `scheduled for ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(current.planChangeEffectiveAt))}`
                  : "being activated after Razorpay confirms the prorated payment"}.
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white" href="/pricing">Compare plans</Link>
              {current.plan !== "free" && !current.cancelAtPeriodEnd ? <button className="rounded-full border border-border-subtle px-5 py-3 text-sm font-semibold" disabled={busy} onClick={() => setConfirmCancel(true)} type="button">Cancel at period end</button> : null}
              {current.cancelAtPeriodEnd ? <button className="rounded-full border border-border-subtle px-5 py-3 text-sm font-semibold" disabled={busy} onClick={() => void mutate("/api/billing/resume")} type="button">Resume subscription</button> : null}
            </div>
          </div>
          <div className="rounded-[24px] border border-border-subtle bg-white p-7">
            <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase text-text-muted">Available credits</p><h2 className="mt-2 text-3xl font-semibold" aria-live="polite">{creditBalance.available}</h2></div><p className="text-sm font-semibold">of {creditBalance.allowance}</p></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-container" role="progressbar" aria-label={`${creditBalance.available} of ${creditBalance.allowance} credits remaining`} aria-valuemax={creditBalance.allowance} aria-valuemin={0} aria-valuenow={creditBalance.available}><div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, creditBalance.available / Math.max(1, creditBalance.allowance) * 100))}%` }} /></div>
            <p className="mt-4 text-sm text-text-muted">Credits refresh on {refreshDate}. Unused credits do not roll over.</p>
            <Link className="mt-6 inline-flex text-sm font-semibold underline" href="/account/billing/usage">View credit activity</Link>
          </div>
        </section>
        {message ? <p className="mt-6 rounded-2xl border border-border-subtle bg-white px-5 py-4 text-sm" role="status">{message}</p> : null}
      </div>
      {confirmCancel ? (
        <div aria-labelledby="cancel-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5" role="dialog">
          <div className="w-full max-w-md rounded-lg bg-white p-7 shadow-xl">
            <h2 className="text-xl font-semibold" id="cancel-title">Cancel at period end?</h2>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              Your {planName} access and monthly credit refreshes continue through the current paid period. You can resume before then.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button autoFocus className="rounded-full border border-border-subtle px-5 py-3 text-sm font-semibold" onClick={() => setConfirmCancel(false)} type="button">Keep plan</button>
              <button className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white" disabled={busy} onClick={() => { setConfirmCancel(false); void mutate("/api/billing/cancel"); }} type="button">Confirm cancellation</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
