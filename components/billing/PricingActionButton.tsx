"use client";

import Link from "next/link";
import { useState } from "react";
import type { BillingInterval, PlanId } from "@/lib/billing/types";
import { trackBillingEvent } from "@/lib/billing/analytics";

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
};

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => { open: () => void };

declare global {
  interface Window { Razorpay?: RazorpayConstructor }
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
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

export function PricingActionButton({
  plan,
  interval = "none",
  children,
  className,
  current = false,
  currentPlan = "free",
}: {
  plan?: Exclude<PlanId, "free">;
  interval?: BillingInterval;
  children: React.ReactNode;
  className: string;
  current?: boolean;
  currentPlan?: PlanId;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (current) {
    return <button className={className} disabled type="button">Current plan</button>;
  }
  if (!plan || interval === "none") {
    return <Link className={className} href="/workspace">{children}</Link>;
  }

  async function startCheckout() {
    if (!plan || interval === "none") return;
    trackBillingEvent("pricing_plan_selected", {
      currentPlan,
      selectedPlan: plan,
      billingInterval: interval,
    });
    trackBillingEvent("checkout_started", { selectedPlan: plan, billingInterval: interval });
    setIsLoading(true);
    setError("");
    try {
      if (currentPlan !== "free") {
        const changeResponse = await fetch("/api/billing/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, interval, idempotencyKey: crypto.randomUUID() }),
        });
        const changeData = await changeResponse.json() as {
          message?: string;
          immediate?: boolean;
        };
        if (!changeResponse.ok) throw new Error(changeData.message || "Unable to change plan.");
        window.location.href = changeData.immediate
          ? "/account/billing?plan_change=processing"
          : "/account/billing?plan_change=scheduled";
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          idempotencyKey: crypto.randomUUID(),
          returnTo: "/account/billing",
        }),
      });
      const data = await response.json() as {
        subscriptionId?: string;
        razorpayKeyId?: string;
        user?: { name?: string; email?: string };
        message?: string;
        error?: string;
      };
      if (response.status === 401) {
        window.location.href = "/login?next=/pricing";
        return;
      }
      if (!response.ok || !data.subscriptionId || !data.razorpayKeyId) {
        throw new Error(data.message || data.error || "Unable to start payment.");
      }
      if (!(await loadRazorpayScript()) || !window.Razorpay) {
        throw new Error("Unable to load Razorpay Checkout.");
      }
      new window.Razorpay({
        key: data.razorpayKeyId,
        subscription_id: data.subscriptionId,
        name: "ProPhrase",
        description: `${plan === "plus" ? "Plus" : "Pro"} ${interval === "annual" ? "Annual" : "Monthly"}`,
        prefill: data.user,
        theme: { color: "#111111" },
        handler: async (paymentResponse) => {
          const verifyResponse = await fetch("/api/billing/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paymentResponse),
          });
          trackBillingEvent(verifyResponse.ok ? "checkout_completed" : "checkout_failed", {
            selectedPlan: plan,
            billingInterval: interval,
            paymentStatusCategory: verifyResponse.ok ? "verified" : "processing",
          });
          window.location.href = verifyResponse.ok
            ? "/account/billing?checkout=complete"
            : "/account/billing?checkout=processing";
        },
      }).open();
    } catch (caughtError) {
      trackBillingEvent("checkout_failed", {
        selectedPlan: plan,
        billingInterval: interval,
        errorCategory: "checkout_request_failed",
      });
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start payment.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button className={className} disabled={isLoading} onClick={() => void startCheckout()} type="button">
        {isLoading
          ? currentPlan === "free" ? "Opening checkout..." : "Updating plan..."
          : children}
      </button>
      {error ? <p className="mt-2 text-center text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
