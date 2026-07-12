import type {
  BillingInterval,
  EntitlementKey,
  PlanDefinition,
  PlanId,
} from "@/lib/billing/types";

type CatalogEnvironment = Record<string, string | undefined>;

const DEFAULTS = {
  FREE_DAILY_CREDITS: 15,
  PLUS_MONTHLY_CREDITS: 300,
  PRO_MONTHLY_CREDITS: 1500,
  PLUS_MONTHLY_PRICE_PAISE: 9900,
  PLUS_ANNUAL_PRICE_PAISE: 89900,
  PRO_MONTHLY_PRICE_PAISE: 24900,
  PRO_ANNUAL_PRICE_PAISE: 199900,
} as const;

function configuredInteger(
  env: CatalogEnvironment,
  key: keyof typeof DEFAULTS,
  { min, max }: { min: number; max: number },
) {
  const raw = env[key];
  if (!raw) return DEFAULTS[key];
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function baseEntitlements(): PlanDefinition["entitlements"] {
  return {
    core_rephrase: true,
    outcome_assistant: true,
    all_tones: false,
    channel_modes: false,
    voice_input: false,
    message_risk_check: false,
    protect_important_details: false,
    promise_lock: false,
    saved_presets: 0,
    saved_personal_style: false,
    advanced_personalization: false,
    advanced_tone_controls: false,
    priority_generation: false,
    early_access: false,
    history_days: 1,
  };
}

export function getPlanCatalog(
  env: CatalogEnvironment = process.env,
): Record<PlanId, PlanDefinition> {
  const free = baseEntitlements();
  const plus = {
    ...baseEntitlements(),
    all_tones: true,
    channel_modes: true,
    voice_input: true,
    message_risk_check: true,
    protect_important_details: true,
    promise_lock: true,
    saved_presets: 3,
    history_days: 30,
  };
  const pro = {
    ...plus,
    saved_presets: 20,
    saved_personal_style: true,
    advanced_personalization: true,
    advanced_tone_controls: true,
    priority_generation: true,
    early_access: true,
    history_days: 365,
  };

  return {
    free: {
      id: "free",
      publicName: "Free",
      description: "For trying ProPhrase and occasional messages",
      monthlyPricePaise: null,
      annualPricePaise: null,
      dailyCredits: configuredInteger(env, "FREE_DAILY_CREDITS", {
        min: 15,
        max: 20,
      }),
      monthlyCredits: null,
      maxInputCharacters: 1200,
      entitlements: free,
    },
    plus: {
      id: "plus",
      publicName: "Plus",
      description: "For regular work communication",
      monthlyPricePaise: configuredInteger(env, "PLUS_MONTHLY_PRICE_PAISE", {
        min: 1,
        max: 10_000_000,
      }),
      annualPricePaise: configuredInteger(env, "PLUS_ANNUAL_PRICE_PAISE", {
        min: 1,
        max: 100_000_000,
      }),
      dailyCredits: null,
      monthlyCredits: configuredInteger(env, "PLUS_MONTHLY_CREDITS", {
        min: 1,
        max: 1_000_000,
      }),
      maxInputCharacters: 2500,
      entitlements: plus,
    },
    pro: {
      id: "pro",
      publicName: "Pro",
      description: "For daily professional use",
      monthlyPricePaise: configuredInteger(env, "PRO_MONTHLY_PRICE_PAISE", {
        min: 1,
        max: 10_000_000,
      }),
      annualPricePaise: configuredInteger(env, "PRO_ANNUAL_PRICE_PAISE", {
        min: 1,
        max: 100_000_000,
      }),
      dailyCredits: null,
      monthlyCredits: configuredInteger(env, "PRO_MONTHLY_CREDITS", {
        min: 1,
        max: 1_000_000,
      }),
      maxInputCharacters: 5000,
      entitlements: pro,
    },
  };
}

export function getPlanDefinition(planId: PlanId, env?: CatalogEnvironment) {
  return getPlanCatalog(env)[planId];
}

export function hasCatalogEntitlement(
  planId: PlanId,
  entitlement: EntitlementKey,
  env?: CatalogEnvironment,
) {
  const value = getPlanDefinition(planId, env).entitlements[entitlement];
  return typeof value === "number" ? value > 0 : value;
}

export function priceForInterval(
  planId: Exclude<PlanId, "free">,
  interval: Exclude<BillingInterval, "none">,
  env?: CatalogEnvironment,
) {
  const plan = getPlanDefinition(planId, env);
  return interval === "monthly"
    ? plan.monthlyPricePaise
    : plan.annualPricePaise;
}

export function publicPlanCatalog(env?: CatalogEnvironment) {
  const catalog = getPlanCatalog(env);
  return (Object.keys(catalog) as PlanId[]).map((id) => {
    const plan = catalog[id];
    return {
      id: plan.id,
      publicName: plan.publicName,
      description: plan.description,
      monthlyPricePaise: plan.monthlyPricePaise,
      annualPricePaise: plan.annualPricePaise,
      dailyCredits: plan.dailyCredits,
      monthlyCredits: plan.monthlyCredits,
      maxInputCharacters: plan.maxInputCharacters,
    };
  });
}
