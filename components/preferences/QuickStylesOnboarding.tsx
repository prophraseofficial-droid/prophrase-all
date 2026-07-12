"use client";

import { useState } from "react";
import { patchPreferences } from "@/lib/preferences/client";
import { trackPreferenceEvent } from "@/lib/preferences/analytics";
import {
  defaultQuickStyles,
  quickStyleGroups,
  quickStyleRegistry,
  type QuickStyleId,
  type UserPreferences,
} from "@/lib/preferences/registry";

export function QuickStylesOnboarding({
  initialPreferences,
  onComplete,
}: {
  initialPreferences: UserPreferences;
  onComplete: (preferences: UserPreferences) => void;
}) {
  const [selected, setSelected] = useState<QuickStyleId[]>(initialPreferences.rephrase.quickStyles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(style: QuickStyleId) {
    setError("");
    setSelected((current) => {
      if (current.includes(style)) return current.length === 1 ? current : current.filter((item) => item !== style);
      if (current.length === 5) return current;
      return [...current, style];
    });
  }

  async function complete(styles: QuickStyleId[], skipped = false) {
    setSaving(true);
    setError("");
    try {
      const state = await patchPreferences({
        onboardingCompleted: true,
        existingNoticeDismissed: true,
        rephrase: {
          quickStyles: styles,
          defaultStyle: styles[0],
        },
      });
      trackPreferenceEvent(
        skipped ? "quick_styles_onboarding_skipped" : "quick_styles_onboarding_completed",
        { selectedCount: styles.length, source: "onboarding" },
      );
      onComplete(state.preferences);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save your styles. Try again.");
      trackPreferenceEvent("preferences_save_failed", { source: "onboarding" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f7f6f2] px-4 py-8 md:py-14" role="dialog" aria-modal="true" aria-labelledby="quick-styles-title">
      <div className="mx-auto max-w-4xl">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold text-text-muted">Welcome to ProPhrase</p>
          <h1 className="mt-3 text-4xl font-bold text-primary md:text-5xl" id="quick-styles-title">Make ProPhrase yours</h1>
          <p className="mt-4 text-base leading-7 text-text-muted">Choose the writing styles you use most. You can change them anytime.</p>
        </header>

        <div className="mt-8 flex items-center justify-between border-y border-border-subtle py-4" aria-live="polite">
          <span className="text-sm font-semibold text-primary">Quick Styles</span>
          <span className="text-sm text-text-muted">{selected.length} of 5 selected</span>
        </div>

        <div className="mt-7 grid gap-7 md:grid-cols-2">
          {quickStyleGroups.map((group) => (
            <section key={group.id} aria-labelledby={`onboarding-${group.id}`}>
              <h2 className="text-sm font-semibold text-text-muted" id={`onboarding-${group.id}`}>{group.label}</h2>
              <div className="mt-3 grid gap-2">
                {quickStyleRegistry.filter((style) => style.group === group.id).map((style) => {
                  const isSelected = selected.includes(style.id);
                  const disabled = !isSelected && selected.length === 5;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`flex min-h-16 items-center justify-between rounded-lg border px-4 py-3 text-left transition ${isSelected ? "border-primary bg-primary text-white" : "border-border-subtle bg-white text-primary hover:border-[#bbb6aa]"} ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                      disabled={disabled || saving}
                      key={style.id}
                      onClick={() => toggle(style.id)}
                      type="button"
                    >
                      <span>
                        <span className="block text-sm font-semibold">{style.label}</span>
                        <span className={`mt-1 block text-xs ${isSelected ? "text-white/70" : "text-text-muted"}`}>{style.description}</span>
                      </span>
                      <span aria-hidden="true" className="ml-3 text-lg">{isSelected ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {error ? <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}

        <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button className="min-h-11 px-3 text-sm font-semibold text-text-muted" disabled={saving} onClick={() => void complete([...defaultQuickStyles], true)} type="button">Skip for now</button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="min-h-11 rounded-lg border border-border-subtle bg-white px-5 text-sm font-semibold text-primary" disabled={saving} onClick={() => setSelected([...defaultQuickStyles])} type="button">Use recommended</button>
            <button className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || selected.length < 1} onClick={() => void complete(selected)} type="button">{saving ? "Saving..." : "Continue to Rephrase"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
