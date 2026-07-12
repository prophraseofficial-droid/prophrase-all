import { NextResponse } from "next/server";
import { estimateCreditCost, CreditCalculationError } from "@/lib/billing/credits";
import { getBillingFlags } from "@/lib/billing/flags";
import { requireUser } from "@/lib/security/auth";
import { creditEstimateSchema, getZodErrorMessage, validationError } from "@/lib/security/validation";

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const parsed = creditEstimateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));
  try {
    return NextResponse.json({
      estimate: estimateCreditCost(parsed.data.operation, parsed.data.text),
      serverAuthoritative: true,
      enabled: getBillingFlags().creditBillingEnabled,
    });
  } catch (error) {
    return validationError(
      error instanceof CreditCalculationError ? error.message : "Unable to estimate credits.",
    );
  }
}
