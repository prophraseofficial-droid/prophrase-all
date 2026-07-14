"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { patchPreferences } from "@/lib/preferences/client";
import { trackPreferenceEvent } from "@/lib/preferences/analytics";
import {
  quickStyleById,
  quickStyleGroups,
  quickStyleIdByTone,
  quickStyleRegistry,
  type QuickStyleId,
  type UserPreferences,
} from "@/lib/preferences/registry";
import type { Tone } from "@/lib/tones";
import { PreferenceDialog } from "./PreferenceDialog";

export function QuickStylesBar({
  preferences,
  selectedTone,
  disabled,
  onSelect,
  onPreferencesChange,
}: {
  preferences: UserPreferences;
  selectedTone: Tone;
  disabled?: boolean;
  onSelect: (tone: Tone) => void;
  onPreferencesChange: (preferences: UserPreferences) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [replaceWith, setReplaceWith] = useState<QuickStyleId | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedId = quickStyleIdByTone[selectedTone];
  const pinned = preferences.rephrase.quickStyles;
  const unpinned = quickStyleRegistry.filter((style) => !pinned.includes(style.id));
  const replaceLabel = replaceWith ? quickStyleById[replaceWith].label : "this style";

  async function persistStyles(styles: QuickStyleId[], defaultStyle = preferences.rephrase.defaultStyle) {
    setSaving(true);
    try {
      const state = await patchPreferences({ rephrase: { quickStyles: styles, defaultStyle } });
      onPreferencesChange(state.preferences);
    } catch {
      // Preference persistence should never interrupt the writing workspace.
    } finally {
      setSaving(false);
    }
  }

  async function pin(style: QuickStyleId) {
    if (pinned.includes(style)) return;
    if (pinned.length === 5) {
      setReplaceWith(style);
      return;
    }
    await persistStyles([...pinned, style]);
    trackPreferenceEvent("quick_style_added", { modeId: style, selectedCount: pinned.length + 1, source: "more_menu" });
  }

  async function replace(existing: QuickStyleId) {
    if (!replaceWith) return;
    const styles = pinned.map((style) => style === existing ? replaceWith : style);
    const defaultStyle = preferences.rephrase.defaultStyle === existing ? replaceWith : preferences.rephrase.defaultStyle;
    await persistStyles(styles, defaultStyle);
    trackPreferenceEvent("quick_style_replaced", { modeId: replaceWith, selectedCount: styles.length, source: "more_menu" });
    setReplaceWith(null);
  }

  return (
    <div className="relative z-20 mx-auto w-full max-w-4xl px-0 py-0">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto" aria-label="Quick Styles">
          {pinned.map((id) => {
            const style = quickStyleById[id];
            const selected = style.tone === selectedTone;
            return (
              <button
                aria-pressed={selected}
                className={selected ? "min-h-9 shrink-0 rounded-full bg-black px-5 text-xs font-semibold text-white" : "min-h-9 shrink-0 rounded-full border border-transparent bg-[#f3f4f5] px-5 text-xs font-semibold text-text-muted hover:bg-[#e5e7eb] hover:text-primary"}
                disabled={disabled || saving}
                key={id}
                onClick={() => {
                  onSelect(style.tone);
                  trackPreferenceEvent("quick_style_selected", { modeId: id, source: "workspace" });
                }}
                type="button"
              >{style.label}</button>
            );
          })}
        </div>

        <details className="relative shrink-0" onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) trackPreferenceEvent("rephrase_more_opened", { source: "workspace" });
        }} ref={detailsRef}>
          <summary aria-label="More styles" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-lg font-semibold text-text-muted hover:bg-[#f3f4f5]">...</summary>
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-border-subtle bg-white p-5 shadow-2xl md:absolute md:inset-auto md:right-0 md:top-12 md:w-80 md:rounded-lg">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-primary">All styles</p>
              <button className="min-h-10 px-2 text-sm font-semibold text-text-muted md:hidden" onClick={() => detailsRef.current?.removeAttribute("open")} type="button">Close</button>
            </div>
            {quickStyleGroups.map((group) => {
              const styles = unpinned.filter((style) => style.group === group.id);
              return styles.length ? (
                <section className="mb-5" key={group.id}>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-text-muted">{group.label}</h3>
                  <div className="grid gap-1">
                    {styles.map((style) => (
                      <div className={selectedId === style.id ? "rounded-lg bg-surface-container-low p-2" : "rounded-lg p-2 hover:bg-surface-container-low"} key={style.id}>
                        <button className="min-h-10 w-full text-left" disabled={disabled} onClick={() => { onSelect(style.tone); detailsRef.current?.removeAttribute("open"); }} type="button">
                          <span className="block text-sm font-semibold text-primary">{style.label}</span>
                          <span className="block text-xs text-text-muted">{style.description}</span>
                        </button>
                        {selectedId === style.id ? <button className="mt-1 text-xs font-semibold text-primary underline" onClick={() => void pin(style.id)} type="button">Pin to Quick Styles</button> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null;
            })}
          </div>
        </details>
        <Link className="sr-only" href="/settings#rephrase" onClick={() => trackPreferenceEvent("rephrase_customize_opened", { source: "workspace" })}>Customize styles</Link>
      </div>

      <PreferenceDialog open={Boolean(replaceWith)} onClose={() => setReplaceWith(null)} titleId="replace-style-title">
          <div className="p-5">
            <h2 className="text-xl font-bold text-primary" id="replace-style-title">Replace a Quick Style</h2>
            <p className="mt-2 text-sm text-text-muted">Choose which style to replace with {replaceLabel}.</p>
            <div className="mt-5 grid gap-2">
              {pinned.map((style) => <button className="min-h-12 rounded-lg border border-border-subtle px-4 text-left text-sm font-semibold hover:bg-surface-container-low" key={style} onClick={() => void replace(style)} type="button">{quickStyleById[style].label}</button>)}
            </div>
            <button className="mt-4 min-h-11 w-full rounded-lg bg-surface-container-low text-sm font-semibold" onClick={() => setReplaceWith(null)} type="button">Cancel</button>
          </div>
      </PreferenceDialog>
    </div>
  );
}
