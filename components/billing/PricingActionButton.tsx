"use client";

import Link from "next/link";
import { useState } from "react";
import type { BillingPlan } from "@/lib/billing/plans";

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
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
};

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PricingActionButton({
  plan,
  children,
  className,
}: {
  plan?: BillingPlan;
  children: React.ReactNode;
  className: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!plan) {
    return (
      <Link className={className} href="/workspace">
        {children}
      </Link>
    );
  }

  async function startCheckout() {
    if (!plan) return;
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json()) as {
        subscriptionId?: string;
        razorpayKeyId?: string;
        plan?: BillingPlan;
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

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Unable to load Razorpay Checkout.");
      }

      const checkout = new window.Razorpay({
        key: data.razorpayKeyId,
        subscription_id: data.subscriptionId,
        name: "ProPhrase",
        description: plan === "pro_yearly" ? "Pro Yearly" : "Pro Monthly",
        prefill: data.user,
        theme: { color: "#111111" },
        handler: async (paymentResponse) => {
          const verifyResponse = await fetch("/api/billing/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paymentResponse),
          });

          if (verifyResponse.ok) {
            window.location.href = "/workspace";
          } else {
            setError("Payment could not be verified. Please contact support.");
          }
        },
      });

      checkout.open();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start payment.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button
        className={className}
        disabled={isLoading}
        onClick={() => void startCheckout()}
        type="button"
      >
        {isLoading ? "Opening checkout..." : children}
      </button>
      {error ? <p className="mt-2 text-center text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
