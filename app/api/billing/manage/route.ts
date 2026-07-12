import { NextResponse } from "next/server";
import { getBillingAccount, getCreditBalance } from "@/lib/billing/account";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const [account, balance] = await Promise.all([
      getBillingAccount(user.id), getCreditBalance(user.id),
    ]);
    return NextResponse.json({ account, balance, providerHostedPortal: null });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load billing management.", 500);
  }
}
