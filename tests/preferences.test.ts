import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePreferences,
  normalizePreferences,
  preferencesPatchSchema,
  userPreferencesSchema,
} from "../lib/preferences/schema.ts";
import {
  defaultQuickStyles,
  recommendedPreferences,
} from "../lib/preferences/registry.ts";
import {
  addQuickStyle,
  removeQuickStyle,
  reorderQuickStyles,
  replaceQuickStyle,
  toggleFavorite,
} from "../lib/preferences/operations.ts";

test("recommended preferences contain the approved ordered defaults", () => {
  const preferences = recommendedPreferences();
  assert.deepEqual(preferences.rephrase.quickStyles, defaultQuickStyles);
  assert.equal(preferences.rephrase.defaultStyle, "professional");
  assert.equal(preferences.outcomeAssistant.defaultVariant, "balanced");
  assert.equal(preferences.outcomeAssistant.defaultChannel, "auto");
});

test("Quick Styles enforce one to five unique known values", () => {
  const defaults = recommendedPreferences();
  assert.equal(userPreferencesSchema.safeParse({ ...defaults, rephrase: { quickStyles: [], defaultStyle: "professional" } }).success, false);
  assert.equal(userPreferencesSchema.safeParse({ ...defaults, rephrase: { quickStyles: ["professional"], defaultStyle: "professional" } }).success, true);
  assert.equal(userPreferencesSchema.safeParse(defaults).success, true);
  assert.equal(userPreferencesSchema.safeParse({ ...defaults, rephrase: { quickStyles: [...defaultQuickStyles, "email"], defaultStyle: "professional" } }).success, false);
  assert.equal(userPreferencesSchema.safeParse({ ...defaults, rephrase: { quickStyles: ["professional", "professional"], defaultStyle: "professional" } }).success, false);
  assert.equal(preferencesPatchSchema.safeParse({ rephrase: { quickStyles: ["unknown"] } }).success, false);
  assert.equal(userPreferencesSchema.safeParse({ ...defaults, rephrase: { quickStyles: ["professional"], defaultStyle: "human" } }).success, false);
});

test("recipient and intent limits are enforced", () => {
  const fourRecipients = ["manager", "client", "colleague", "customer"];
  const fiveRecipients = [...fourRecipients, "vendor"];
  const sixIntents = ["request", "follow_up", "approval", "status_update", "extension_request", "rejection"];
  const sevenIntents = [...sixIntents, "feedback"];
  assert.equal(preferencesPatchSchema.safeParse({ outcomeAssistant: { favoriteRecipients: fourRecipients } }).success, true);
  assert.equal(preferencesPatchSchema.safeParse({ outcomeAssistant: { favoriteRecipients: fiveRecipients } }).success, false);
  assert.equal(preferencesPatchSchema.safeParse({ outcomeAssistant: { favoriteIntents: sixIntents } }).success, true);
  assert.equal(preferencesPatchSchema.safeParse({ outcomeAssistant: { favoriteIntents: sevenIntents } }).success, false);
});

test("partial updates preserve unrelated preference sections and array order", () => {
  const current = recommendedPreferences();
  const updated = mergePreferences(current, {
    rephrase: { quickStyles: ["human", "professional"], defaultStyle: "human" },
  });
  assert.deepEqual(updated.rephrase.quickStyles, ["human", "professional"]);
  assert.deepEqual(updated.outcomeAssistant, current.outcomeAssistant);
  assert.equal(updated.onboardingCompleted, current.onboardingCompleted);
});

test("onboarding completion and dismissal can be persisted independently", () => {
  const current = recommendedPreferences();
  const completed = mergePreferences(current, { onboardingCompleted: true });
  assert.equal(completed.onboardingCompleted, true);
  assert.equal(completed.existingNoticeDismissed, false);
});

test("Quick Style add, remove, reorder and replace preserve order and defaults", () => {
  assert.deepEqual(addQuickStyle(["professional"], "human"), {
    status: "added",
    styles: ["professional", "human"],
  });
  assert.equal(addQuickStyle(defaultQuickStyles, "email").status, "replace_required");
  assert.deepEqual(removeQuickStyle(["professional", "human"], "professional"), ["human"]);
  assert.deepEqual(removeQuickStyle(["professional"], "professional"), ["professional"]);
  assert.deepEqual(reorderQuickStyles(["professional", "human", "shorter"], 2, -1), ["professional", "shorter", "human"]);
  const preferences = recommendedPreferences();
  const replaced = replaceQuickStyle(preferences, "professional", "email");
  assert.equal(replaced.rephrase.quickStyles[0], "email");
  assert.equal(replaced.rephrase.defaultStyle, "email");
  assert.deepEqual(preferences.rephrase.quickStyles, defaultQuickStyles);
});

test("favorite toggles enforce limits without unintended preference changes", () => {
  assert.deepEqual(toggleFavorite(["manager", "client"], "colleague", 4), ["manager", "client", "colleague"]);
  assert.deepEqual(toggleFavorite(["manager", "client", "colleague", "vendor"], "customer", 4), ["manager", "client", "colleague", "vendor"]);
  assert.deepEqual(toggleFavorite(["manager", "client"], "manager", 4), ["client"]);
});

test("corrupted stored preferences safely remove unknown values", () => {
  const normalized = normalizePreferences({
    preferencesVersion: 1,
    onboardingCompleted: true,
    existingNoticeDismissed: true,
    rephrase: { quickStyles: ["unknown", "human"], defaultStyle: "unknown" },
    outcomeAssistant: {
      favoriteRecipients: ["unknown", "client"],
      favoriteIntents: ["unknown", "request"],
      defaultChannel: "carrier_pigeon",
      defaultVariant: "extreme",
    },
  });
  assert.deepEqual(normalized.rephrase.quickStyles, ["human"]);
  assert.equal(normalized.rephrase.defaultStyle, "human");
  assert.deepEqual(normalized.outcomeAssistant.favoriteRecipients, ["client"]);
  assert.deepEqual(normalized.outcomeAssistant.favoriteIntents, ["request"]);
  assert.equal(normalized.outcomeAssistant.defaultChannel, "auto");
  assert.equal(normalized.outcomeAssistant.defaultVariant, "balanced");
});
