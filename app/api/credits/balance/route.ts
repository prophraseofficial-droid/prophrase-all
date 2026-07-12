import { NextResponse } from "next/server";
import { getCreditBalance } from "@/lib/billing/account";
import { getBillingFlags } from "@/lib/billing/flags";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const flags = getBillingFlags();
  if (!flags.creditBillingEnabled) {
    return NextResponse.json({ enabled: false, shadowMode: flags.creditBillingShadowMode });
  }
  try {
    return NextResponse.json({
      enabled: true,
      shadowMode: flags.creditBillingShadowMode,
      balance: await getCreditBalance(user.id),
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load credit balance.", 500);
  }
}
