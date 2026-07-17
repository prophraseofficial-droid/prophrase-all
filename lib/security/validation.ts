import { NextResponse } from "next/server";
import { z } from "zod";
import {
  channelOptions,
  intentOptions,
  recipientOptions,
  relationshipOptions,
  urgencyOptions,
} from "@/lib/outcome-assistant/types";
import { tones } from "@/lib/tones";

export const toneSchema = z.enum(tones);

export const uuidSchema = z.string().uuid();

export const rewriteBodySchema = z.object({
  text: z.string().trim().min(3).max(5000),
  tone: toneSchema,
  instruction: z.string().trim().min(3).max(240).optional(),
  threadId: uuidSchema.optional(),
});

export const outcomeAssistantBodySchema = z
  .object({
    originalText: z.string().trim().min(3).max(5000),
    recipient: z.enum(recipientOptions),
    customRecipient: z.string().trim().max(80).optional(),
    intent: z.enum(intentOptions),
    customIntent: z.string().trim().max(120).optional(),
    relationshipLevel: z.enum(relationshipOptions).optional(),
    urgency: z.enum(urgencyOptions).optional(),
    desiredResponse: z.string().trim().max(150).optional(),
    channel: z.enum(channelOptions).default("email"),
    lockedFacts: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    languageMode: z.enum(["standard", "indian_workplace"]).default("standard"),
  })
  .superRefine((value, context) => {
    if (value.recipient === "other" && !value.customRecipient?.trim()) {
      context.addIssue({
        code: "custom",
        message: "Describe the recipient.",
        path: ["customRecipient"],
      });
    }

    if (value.intent === "other" && !value.customIntent?.trim()) {
      context.addIssue({
        code: "custom",
        message: "Describe the intended outcome.",
        path: ["customIntent"],
      });
    }
  });

export const createThreadSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  tone: toneSchema.default("Professional"),
});

export const updateThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    tone: toneSchema.optional(),
    is_favorite: z.boolean().optional(),
    is_archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const messageBodySchema = z.object({
  text: z.string().trim().min(3).max(5000),
  tone: toneSchema,
});

export const billingPlanSchema = z.object({
  plan: z.enum(["pro_monthly", "pro_yearly"]),
});

export const billingCheckoutSchema = z.object({
  plan: z.enum(["plus", "pro"]),
  interval: z.enum(["monthly", "annual"]),
  idempotencyKey: z.string().trim().min(8).max(120),
  returnTo: z.string().trim().regex(/^\/[A-Za-z0-9/_?=&.-]*$/).default("/account/billing"),
});

export const billingChangePlanSchema = z.object({
  plan: z.enum(["plus", "pro"]),
  interval: z.enum(["monthly", "annual"]),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const creditEstimateSchema = z.object({
  operation: z.enum([
    "rephrase",
    "outcome_assistant",
    "regenerate_all",
    "extra_variant",
    "tone_explanation",
    "edited_message_check",
    "voice_transcription",
  ]),
  text: z.string().max(5000),
});

export const deviceIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9._:-]+$/, "Invalid device id.");

export const registerDeviceSchema = z.object({
  deviceId: deviceIdSchema,
  label: z.string().trim().min(2).max(80),
  platform: z
    .enum(["web", "desktop", "android", "ios", "extension"])
    .default("web"),
  capabilities: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
});

export const universalClipboardCreateSchema = z.object({
  deviceId: deviceIdSchema,
  deviceLabel: z.string().trim().min(2).max(80),
  text: z.string().trim().min(1).max(4000),
  expiresInSeconds: z.number().int().min(30).max(3600).default(600),
  platform: z
    .enum(["web", "desktop", "android", "ios", "extension"])
    .default("web"),
});

export const universalClipboardClaimSchema = z.object({
  deviceId: deviceIdSchema,
  deviceLabel: z.string().trim().min(2).max(80),
  platform: z
    .enum(["web", "desktop", "android", "ios", "extension"])
    .default("web"),
});

const razorpayIdSchema = (prefix: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`), `Invalid ${prefix} id.`);

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: razorpayIdSchema("pay").max(100),
  razorpay_subscription_id: razorpayIdSchema("sub").max(100),
  razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/i),
});

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "FREE_REWRITE_LIMIT_REACHED"
  | "FREE_THREAD_LIMIT_REACHED"
  | "FREE_FOLLOWUP_LIMIT_REACHED"
  | "PRO_FAIR_USE_LIMIT_REACHED"
  | "THREAD_NOT_FOUND"
  | "PAYMENT_VERIFICATION_FAILED"
  | "CREDIT_BILLING_DISABLED"
  | "INVALID_PLAN"
  | "INVALID_BILLING_INTERVAL"
  | "PLAN_UPGRADE_REQUIRED"
  | "INPUT_LIMIT_EXCEEDED"
  | "INSUFFICIENT_CREDITS"
  | "CREDIT_RESERVATION_FAILED"
  | "CREDIT_REQUEST_IN_PROGRESS"
  | "PAYMENT_PROCESSING"
  | "SUBSCRIPTION_NOT_ACTIVE"
  | "SUBSCRIPTION_CANCELLATION_PENDING"
  | "PLAN_CHANGE_PENDING"
  | "PLAN_CHANGE_REQUIRED"
  | "SUBSCRIPTION_PAST_DUE"
  | "CHECKOUT_FAILED"
  | "WEBHOOK_VERIFICATION_FAILED"
  | "GENERATION_FAILED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "SUBSCRIPTION_REQUIRED"
  | "AI_PROVIDER_ERROR"
  | "AI_PROVIDER_QUOTA_EXHAUSTED"
  | "CLIPBOARD_NOT_FOUND"
  | "CLIPBOARD_ALREADY_CLAIMED"
  | "CLIPBOARD_EXPIRED"
  | "CONFIGURATION_ERROR"
  | "FEATURE_DISABLED"
  | "INVALID_AI_OUTPUT"
  | "PREFERENCE_VALIDATION_FAILED"
  | "QUICK_STYLE_LIMIT_EXCEEDED"
  | "INVALID_QUICK_STYLE"
  | "DEFAULT_STYLE_NOT_SELECTED"
  | "FAVORITE_RECIPIENT_LIMIT_EXCEEDED"
  | "FAVORITE_INTENT_LIMIT_EXCEEDED"
  | "PREFERENCES_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function apiError(
  error: ApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error, code: error, message, ...extra }, { status });
}

export function validationError(message = "Invalid request.") {
  return apiError("VALIDATION_ERROR", message, 400);
}

export function getZodErrorMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request.";
}
