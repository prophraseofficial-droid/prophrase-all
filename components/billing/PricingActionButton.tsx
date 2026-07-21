"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>("script[data-prophrase-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
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

  void razorpayScriptPromise.then((loaded) => {
    if (!loaded) razorpayScriptPromise = null;
  });
  return razorpayScriptPromise;
}

function LoadingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span>{children}</span>
    </span>
  );
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
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "opening" | "verifying">("idle");
  const [error, setError] = useState("");
  const isLoading = phase !== "idle";

  useEffect(() => {
    router.prefetch("/account/billing");
    void loadRazorpayScript();
  }, [router]);

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
    setPhase("opening");
    setError("");
    const razorpayReady = loadRazorpayScript();
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
          requiresCheckout?: boolean;
          subscriptionId?: string;
          razorpayKeyId?: string;
          user?: { name?: string; email?: string };
        };
        if (!changeResponse.ok) throw new Error(changeData.message || "Unable to change plan.");
        if (changeData.requiresCheckout) {
          if (!changeData.subscriptionId || !changeData.razorpayKeyId) {
            throw new Error("Razorpay authorization details are incomplete.");
          }
          if (!(await razorpayReady) || !window.Razorpay) {
            throw new Error("Unable to load Razorpay Checkout.");
          }
          new window.Razorpay({
            key: changeData.razorpayKeyId,
            subscription_id: changeData.subscriptionId,
            name: "ProPhrase",
            description: `Authorize ${plan === "plus" ? "Plus" : "Pro"} ${interval === "annual" ? "Annual" : "Monthly"} · refundable ₹5 mandate check`,
            prefill: changeData.user,
            theme: { color: "#111111" },
            handler: async (paymentResponse) => {
              await verifyAndNavigate(
                paymentResponse,
                "/account/billing?plan_change=processing",
              );
            },
          }).open();
          return;
        }
        router.replace(changeData.immediate
          ? "/account/billing?plan_change=processing"
          : "/account/billing?plan_change=scheduled");
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
        router.replace("/login?next=/pricing");
        return;
      }
      if (!response.ok || !data.subscriptionId || !data.razorpayKeyId) {
        throw new Error(data.message || data.error || "Unable to start payment.");
      }
      if (!(await razorpayReady) || !window.Razorpay) {
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
          await verifyAndNavigate(paymentResponse, "/account/billing?checkout=complete");
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
      setPhase((currentPhase) => currentPhase === "opening" ? "idle" : currentPhase);
    }
  }

  async function verifyAndNavigate(
    paymentResponse: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    },
    successPath: string,
  ) {
    setPhase("verifying");
    setError("");
    let verified = false;
    try {
      const verifyResponse = await fetch("/api/billing/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentResponse),
      });
      verified = verifyResponse.ok;
    } catch {
      verified = false;
    }
    trackBillingEvent(verified ? "checkout_completed" : "checkout_failed", {
      selectedPlan: plan,
      billingInterval: interval,
      paymentStatusCategory: verified ? "verified" : "processing",
    });
    router.replace(verified ? successPath : "/account/billing?checkout=processing");
  }

  return (
    <div>
      <button className={className} disabled={isLoading} onClick={() => void startCheckout()} type="button">
        {phase === "opening"
          ? <LoadingLabel>{currentPlan === "free" ? "Opening checkout..." : "Updating plan..."}</LoadingLabel>
          : children}
      </button>
      {error ? <p className="mt-2 text-center text-sm text-red-700" role="alert">{error}</p> : null}
      {phase === "verifying" ? (
        <div
          aria-live="polite"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-6 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
            <span
              aria-hidden="true"
              className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[#ead28a] border-t-[#111111]"
            />
            <h2 className="mt-5 text-xl font-semibold text-[#111111]">Confirming your payment</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Payment received. Please keep this page open while we activate your plan.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
