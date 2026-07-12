import { NextResponse } from "next/server";
import { publicPlanCatalog } from "@/lib/billing/catalog";
import { getBillingFlags } from "@/lib/billing/flags";

export async function GET() {
  const flags = getBillingFlags();
  return NextResponse.json({
    currency: process.env.BILLING_CURRENCY || "INR",
    plans: publicPlanCatalog(),
    checkoutEnabled: flags.paidCheckoutEnabled,
    taxNote: process.env.BILLING_TAX_NOTE || "Taxes may apply at checkout.",
  });
}
