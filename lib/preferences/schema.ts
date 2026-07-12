import { z } from "zod";
import { channelOptions, intentOptions, recipientOptions, versionIds } from "../outcome-assistant/types.ts";
import { quickStyleIds, recommendedPreferences, type UserPreferences } from "./registry.ts";

const quickStyleSchema = z.enum(quickStyleIds);
const uniqueArray = <T extends z.ZodTypeAny>(schema: T, duplicateMessage: string) =>
  z.array(schema).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: duplicateMessage });
    }
  });

export const rephrasePreferencesSchema = z.object({
  quickStyles: uniqueArray(quickStyleSchema, "Quick Styles must be unique.")
    .min(1, "Choose at least one Quick Style.")
    .max(5, "Choose no more than five Quick Styles."),
  defaultStyle: quickStyleSchema,
}).superRefine((value, context) => {
  if (!value.quickStyles.includes(value.defaultStyle)) {
    context.addIssue({
      code: "custom",
      path: ["defaultStyle"],
      message: "The default style must be selected as a Quick Style.",
    });
  }
});

export const outcomePreferencesSchema = z.object({
  favoriteRecipients: uniqueArray(z.enum(recipientOptions), "Favorite recipients must be unique.")
    .max(4, "Choose no more than four favorite recipients."),
  favoriteIntents: uniqueArray(z.enum(intentOptions), "Favorite intents must be unique.")
    .max(6, "Choose no more than six favorite intents."),
  defaultChannel: z.union([z.literal("auto"), z.enum(channelOptions)]),
  defaultVariant: z.enum(versionIds),
});

export const userPreferencesSchema = z.object({
  preferencesVersion: z.literal(1),
  onboardingCompleted: z.boolean(),
  existingNoticeDismissed: z.boolean(),
  rephrase: rephrasePreferencesSchema,
  outcomeAssistant: outcomePreferencesSchema,
});

export const preferencesPatchSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  existingNoticeDismissed: z.boolean().optional(),
  rephrase: z.object({
    quickStyles: uniqueArray(quickStyleSchema, "Quick Styles must be unique.")
      .min(1, "Choose at least one Quick Style.")
      .max(5, "Choose no more than five Quick Styles.")
      .optional(),
    defaultStyle: quickStyleSchema.optional(),
  }).partial().optional(),
  outcomeAssistant: z.object({
    favoriteRecipients: uniqueArray(z.enum(recipientOptions), "Favorite recipients must be unique.")
      .max(4, "Choose no more than four favorite recipients.")
      .optional(),
    favoriteIntents: uniqueArray(z.enum(intentOptions), "Favorite intents must be unique.")
      .max(6, "Choose no more than six favorite intents.")
      .optional(),
    defaultChannel: z.union([z.literal("auto"), z.enum(channelOptions)]).optional(),
    defaultVariant: z.enum(versionIds).optional(),
  }).partial().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one preference is required.",
});

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

export function normalizePreferences(value: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const defaults = recommendedPreferences();
  if (!value || typeof value !== "object") return defaults;
  const candidate = value as Partial<UserPreferences>;
  const quickStyles = Array.isArray(candidate.rephrase?.quickStyles)
    ? candidate.rephrase.quickStyles.filter((style): style is typeof quickStyleIds[number] =>
      quickStyleIds.includes(style as typeof quickStyleIds[number]))
    : defaults.rephrase.quickStyles;
  const safeStyles = Array.from(new Set(quickStyles)).slice(0, 5);
  if (!safeStyles.length) safeStyles.push(defaults.rephrase.defaultStyle);
  const defaultStyle = safeStyles.includes(candidate.rephrase?.defaultStyle as typeof safeStyles[number])
    ? candidate.rephrase!.defaultStyle!
    : safeStyles[0];
  const candidateOutcome = candidate.outcomeAssistant;
  const candidateDefaultChannel = candidateOutcome?.defaultChannel;
  const favoriteRecipients = Array.isArray(candidateOutcome?.favoriteRecipients)
    ? Array.from(new Set(candidateOutcome.favoriteRecipients.filter((recipient) =>
      recipientOptions.includes(recipient as typeof recipientOptions[number])))).slice(0, 4)
    : defaults.outcomeAssistant.favoriteRecipients;
  const favoriteIntents = Array.isArray(candidateOutcome?.favoriteIntents)
    ? Array.from(new Set(candidateOutcome.favoriteIntents.filter((intent) =>
      intentOptions.includes(intent as typeof intentOptions[number])))).slice(0, 6)
    : defaults.outcomeAssistant.favoriteIntents;
  const defaultChannel = candidateDefaultChannel === "auto"
    || channelOptions.includes(candidateDefaultChannel as typeof channelOptions[number])
    ? candidateDefaultChannel
    : defaults.outcomeAssistant.defaultChannel;
  const defaultVariant = versionIds.includes(candidateOutcome?.defaultVariant as typeof versionIds[number])
    ? candidateOutcome!.defaultVariant
    : defaults.outcomeAssistant.defaultVariant;

  return userPreferencesSchema.parse({
    ...defaults,
    onboardingCompleted: candidate.onboardingCompleted ?? defaults.onboardingCompleted,
    existingNoticeDismissed: candidate.existingNoticeDismissed ?? defaults.existingNoticeDismissed,
    rephrase: { quickStyles: safeStyles, defaultStyle },
    outcomeAssistant: {
      favoriteRecipients,
      favoriteIntents,
      defaultChannel,
      defaultVariant,
    },
  });
}

export function mergePreferences(
  current: UserPreferences,
  patch: PreferencesPatch,
) {
  return userPreferencesSchema.parse({
    ...current,
    ...patch,
    rephrase: { ...current.rephrase, ...(patch.rephrase ?? {}) },
    outcomeAssistant: {
      ...current.outcomeAssistant,
      ...(patch.outcomeAssistant ?? {}),
    },
  });
}

export function preferenceErrorCode(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  if (path.includes("quickStyles") && issue?.code === "too_big") return "QUICK_STYLE_LIMIT_EXCEEDED";
  if (path.includes("defaultStyle")) return "DEFAULT_STYLE_NOT_SELECTED";
  if (path.includes("favoriteRecipients") && issue?.code === "too_big") return "FAVORITE_RECIPIENT_LIMIT_EXCEEDED";
  if (path.includes("favoriteIntents") && issue?.code === "too_big") return "FAVORITE_INTENT_LIMIT_EXCEEDED";
  if (path.includes("quickStyles")) return "INVALID_QUICK_STYLE";
  return "PREFERENCE_VALIDATION_FAILED";
}
