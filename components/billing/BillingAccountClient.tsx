"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreditBalance } from "@/lib/billing/types";
import { trackBillingEvent } from "@/lib/billing/analytics";
import { classifyPlanChange } from "@/lib/billing/plan-change";

type Account = {
  plan: "free" | "plus" | "pro";
  billingInterval: "none" | "monthly" | "annual";
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  entitlementCycleStart: string | null;
  entitlementCycleEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: "plus" | "pro" | null;
  pendingPlanCredits: number | null;
  pendingBillingInterval: "monthly" | "annual" | null;
  planChangeEffectiveAt: string | null;
  subscriptionId: string | null;
  providerSubscriptionId: string | null;
};

type Profile = { email: string; name: string };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" });

function formatDate(value: string | null, fallback = "Not available") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function planLabel(plan: Account["plan"]) {
  return plan === "free" ? "Free" : plan === "plus" ? "Plus" : "Pro";
}

function intervalLabel(interval: Account["billingInterval"]) {
  return interval === "annual" ? "Annual" : interval === "monthly" ? "Monthly" : "No billing cycle";
}

type RazorpayWindow = Window & {
  Razorpay?: new (options: {
    key: string;
    subscription_id: string;
    name: string;
    description: string;
    prefill?: { name?: string; email?: string };
    theme?: { color?: string };
    handler: (response: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }) => void;
  }) => { open: () => void };
};

async function loadRazorpayCheckout() {
  const razorpayWindow = window as RazorpayWindow;
  if (razorpayWindow.Razorpay) return true;
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-prophrase-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.prophraseRazorpay = "true";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function BillingAccountClient({
  account,
  balance,
  profile,
}: {
  account: Account;
  balance: CreditBalance;
  profile: Profile;
}) {
  const [current, setCurrent] = useState(account);
  const [creditBalance, setCreditBalance] = useState(balance);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const currentPlanName = planLabel(current.plan);
  const pendingPlanName = current.pendingPlan ? planLabel(current.pendingPlan) : null;
  const pendingChangeTiming =
    current.plan !== "free" && current.billingInterval !== "none" &&
    current.pendingPlan && current.pendingBillingInterval
      ? classifyPlanChange(
          { plan: current.plan, interval: current.billingInterval },
          { plan: current.pendingPlan, interval: current.pendingBillingInterval },
        )
      : null;
  const refreshDate = formatDate(creditBalance.nextRefreshAt, "Not scheduled");
  const creditsUsed = Math.max(
    0,
    creditBalance.allowance - creditBalance.available - creditBalance.reserved,
  );
  const creditPercent = Math.max(
    0,
    Math.min(100, creditBalance.available / Math.max(1, creditBalance.allowance) * 100),
  );
  const renewsAutomatically =
    current.plan !== "free" &&
    !current.cancelAtPeriodEnd &&
    !["expired", "refunded", "chargeback"].includes(current.subscriptionStatus);
  const reference = current.providerSubscriptionId
    ? `${current.providerSubscriptionId.slice(0, 8)}…${current.providerSubscriptionId.slice(-4)}`
    : "Not assigned";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan_change") !== "processing") return;
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function refreshUpgrade() {
      attempts += 1;
      try {
        const response = await fetch("/api/billing/subscription-status", { cache: "no-store" });
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
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: path.endsWith("resume") ? { "Content-Type": "application/json" } : undefined,
        body: path.endsWith("resume")
          ? JSON.stringify({ idempotencyKey: crypto.randomUUID() })
          : undefined,
      });
      const data = await response.json() as {
        message?: string;
        effectiveAt?: string;
        requiresCheckout?: boolean;
        subscriptionId?: string;
        razorpayKeyId?: string;
        plan?: "plus" | "pro";
        interval?: "monthly" | "annual";
        planCredits?: number | null;
        reusedMandate?: boolean;
        user?: { name?: string; email?: string };
      };
      if (!response.ok) throw new Error(data.message || "Unable to update subscription.");
      if (path.endsWith("resume") && data.requiresCheckout) {
        if (!data.subscriptionId || !data.razorpayKeyId || !(await loadRazorpayCheckout())) {
          throw new Error("Unable to open Razorpay authorization.");
        }
        const razorpayWindow = window as RazorpayWindow;
        if (!razorpayWindow.Razorpay) throw new Error("Unable to load Razorpay Checkout.");
        new razorpayWindow.Razorpay({
          key: data.razorpayKeyId,
          subscription_id: data.subscriptionId,
          name: "ProPhrase",
          description: `Resume ${planLabel(data.plan ?? current.plan)} autopay`,
          prefill: data.user,
          theme: { color: "#111111" },
          handler: async (paymentResponse) => {
            const verification = await fetch("/api/billing/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(paymentResponse),
            });
            window.location.href = verification.ok
              ? "/account/billing?autopay=reauthorized"
              : "/account/billing?checkout=processing";
          },
        }).open();
        return;
      }
      const canceled = path.endsWith("cancel");
      setCurrent((value) => ({
        ...value,
        cancelAtPeriodEnd: canceled,
        subscriptionStatus: canceled ? "canceled" : "active",
        ...(!canceled && data.plan && data.interval ? {
          pendingPlan: data.plan,
          pendingPlanCredits: data.planCredits ?? null,
          pendingBillingInterval: data.interval,
          planChangeEffectiveAt: data.effectiveAt ?? current.currentPeriodEnd,
        } : {}),
      }));
      trackBillingEvent(canceled ? "subscription_canceled" : "subscription_resumed", {
        currentPlan: current.plan,
        billingInterval: current.billingInterval,
      });
      setMessage(canceled
        ? `Your ${currentPlanName} plan remains active until ${formatDate(data.effectiveAt ?? current.currentPeriodEnd, "the end of the paid period")}. The ${pendingPlanName ?? currentPlanName} renewal was canceled.`
        : data.reusedMandate
          ? `Autopay resumed for ${data.plan ? planLabel(data.plan) : currentPlanName} at renewal. Your existing mandate was reused with no new authorization charge.`
          : "Autopay is active again. Your subscription will continue at the next renewal.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update subscription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="billing-page">
      <header className="billing-header">
        <Link className="billing-brand" href="/">
          <Image alt="ProPhrase" height={44} priority src="/prophrase-logo-transparent.png" width={44} />
          <span>ProPhrase</span>
        </Link>
        <Link className="billing-back" href="/workspace">Back to workspace <span aria-hidden="true">→</span></Link>
      </header>

      <div className="billing-shell">
        <section className="billing-hero">
          <div>
            <p className="billing-eyebrow">Account</p>
            <h1>Manage billing &amp; credits.</h1>
            <p>See your plan, renewal schedule, autopay status and credit activity in one place.</p>
          </div>
          <div className="billing-plan-chip">
            <span>{currentPlanName}</span>
            <small>{current.billingInterval === "none" ? "Current plan" : `${intervalLabel(current.billingInterval)} plan`}</small>
          </div>
        </section>

        {message ? <p className="billing-notice" role="status">{message}</p> : null}

        <section className="billing-summary-grid" aria-label="Billing summary">
          <article className="billing-card billing-plan-card">
            <p className="billing-card-label">Current plan</p>
            <div className="billing-plan-title">
              <h2>{currentPlanName}</h2>
              <span>{current.cancelAtPeriodEnd ? "Cancellation scheduled" : titleCase(current.subscriptionStatus)}</span>
            </div>
            <p className="billing-plan-description">
              {current.plan === "free"
                ? "15 credits refreshed every day. No payment method or autopay is active."
                : `${intervalLabel(current.billingInterval)} billing with ${creditBalance.allowance.toLocaleString("en-IN")} credits per credit cycle.`}
            </p>
            {current.cancelAtPeriodEnd ? (
              <div className="billing-pending billing-cancellation-summary" role="status">
                <strong>Cancellation scheduled</strong>
                <span>
                  Your {currentPlanName} access and {creditBalance.allowance.toLocaleString("en-IN")} credits remain available until {formatDate(current.currentPeriodEnd, "the end of the paid period")}.
                </span>
                {pendingPlanName ? (
                  <span>The scheduled {pendingPlanName} renewal will not start.</span>
                ) : null}
                <span>After that date, your account moves to Free and autopay stops.</span>
              </div>
            ) : pendingPlanName && current.pendingBillingInterval ? (
              <div className="billing-pending" role="status">
                <strong>{pendingPlanName} · {intervalLabel(current.pendingBillingInterval)}</strong>
                {current.pendingPlanCredits ? (
                  <span>{current.pendingPlanCredits.toLocaleString("en-IN")} credits refreshed every month</span>
                ) : null}
                <span>{pendingChangeTiming === "cycle_end" && current.planChangeEffectiveAt
                    ? `Scheduled for ${formatDate(current.planChangeEffectiveAt)}`
                  : "Waiting for Razorpay to confirm the plan change"}</span>
                {pendingChangeTiming === "cycle_end" ? (
                  <span>No plan-change fee today. Any ₹5 Razorpay mandate check is automatically refunded.</span>
                ) : null}
              </div>
            ) : null}
            <div className="billing-actions">
              <Link className="billing-button billing-button-gold" href="/pricing">Compare plans</Link>
              {current.plan !== "free" && !current.cancelAtPeriodEnd ? (
                <button className="billing-button billing-button-outline-dark" disabled={busy} onClick={() => setConfirmCancel(true)} type="button">Cancel at period end</button>
              ) : null}
              {current.cancelAtPeriodEnd ? (
                <button className="billing-button billing-button-outline-dark" disabled={busy} onClick={() => void mutate("/api/billing/resume")} type="button">Resume autopay</button>
              ) : null}
            </div>
          </article>

          <article className="billing-card billing-credit-card">
            <div className="billing-credit-heading">
              <div>
                <p className="billing-card-label">Available credits</p>
                <h2 aria-live="polite">{creditBalance.available.toLocaleString("en-IN")}</h2>
              </div>
              <p>of {creditBalance.allowance.toLocaleString("en-IN")}</p>
            </div>
            <div aria-label={`${creditBalance.available} of ${creditBalance.allowance} credits remaining`} aria-valuemax={creditBalance.allowance} aria-valuemin={0} aria-valuenow={creditBalance.available} className="billing-credit-track" role="progressbar">
              <span style={{ width: `${creditPercent}%` }} />
            </div>
            <div className="billing-credit-stats">
              <div><span>Used</span><strong>{creditsUsed.toLocaleString("en-IN")}</strong></div>
              <div><span>Reserved</span><strong>{creditBalance.reserved.toLocaleString("en-IN")}</strong></div>
              <div><span>Refreshes</span><strong>{refreshDate}</strong></div>
            </div>
            <Link className="billing-text-link" href="/account/billing/usage">View credit activity <span aria-hidden="true">→</span></Link>
          </article>
        </section>

        <section className="billing-detail-grid">
          <article className="billing-card billing-detail-card">
            <div className="billing-section-heading">
              <div><p className="billing-card-label">Subscription</p><h2>Billing &amp; autopay</h2></div>
              <span className={renewsAutomatically ? "is-active" : ""}>{renewsAutomatically ? "Autopay active" : current.cancelAtPeriodEnd ? "Autopay ending" : "No autopay"}</span>
            </div>
            <dl className="billing-detail-list">
              <div><dt>Plan started</dt><dd>{formatDate(current.subscriptionStartedAt ?? current.currentPeriodStart)}</dd></div>
              <div><dt>Billing cycle</dt><dd>{intervalLabel(current.billingInterval)}</dd></div>
              <div><dt>Current paid period</dt><dd>{current.plan === "free" ? "Not applicable" : `${formatDate(current.currentPeriodStart)} — ${formatDate(current.currentPeriodEnd)}`}</dd></div>
              <div><dt>Next autopay</dt><dd>{renewsAutomatically ? formatDate(current.currentPeriodEnd) : current.cancelAtPeriodEnd ? "Canceled after current period" : "Not scheduled"}</dd></div>
              <div><dt>Autopay duration</dt><dd>{renewsAutomatically ? "Renews each billing cycle until you cancel" : current.cancelAtPeriodEnd ? `Stops after ${formatDate(current.currentPeriodEnd)}` : "Not enabled"}</dd></div>
              <div><dt>Access available through</dt><dd>{current.plan === "free" ? "Ongoing free plan" : formatDate(current.currentPeriodEnd)}</dd></div>
              <div><dt>Subscription reference</dt><dd><code>{reference}</code></dd></div>
            </dl>
          </article>

          <article className="billing-card billing-account-card">
            <p className="billing-card-label">Profile</p>
            <h2>{profile.name}</h2>
            <p>{profile.email}</p>
            <div className="billing-account-fact">
              <span>Credit cycle</span>
              <strong>{formatDate(current.entitlementCycleStart, "Current cycle")} — {formatDate(current.entitlementCycleEnd, refreshDate)}</strong>
            </div>
            <div className="billing-account-fact">
              <span>Unused credits</span>
              <strong>Do not roll over after the refresh date</strong>
            </div>
            <Link className="billing-button billing-button-dark" href="/settings">App settings</Link>
          </article>
        </section>
      </div>

      {confirmCancel ? (
        <div aria-labelledby="cancel-title" aria-modal="true" className="billing-modal-backdrop" role="dialog">
          <div className="billing-modal">
            <p className="billing-card-label">Subscription</p>
            <h2 id="cancel-title">Cancel at period end?</h2>
            <p>
              Your {currentPlanName} access and credits continue through {formatDate(current.currentPeriodEnd, "the current paid period")}.
              {pendingPlanName
                ? ` The scheduled ${pendingPlanName} renewal will also be canceled.`
                : " Autopay will stop after that date."}
            </p>
            <div className="billing-actions">
              <button autoFocus className="billing-button billing-button-outline" onClick={() => setConfirmCancel(false)} type="button">Keep plan</button>
              <button className="billing-button billing-button-dark" disabled={busy} onClick={() => { setConfirmCancel(false); void mutate("/api/billing/cancel"); }} type="button">Confirm cancellation</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
