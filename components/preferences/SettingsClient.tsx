"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { patchPreferences } from "@/lib/preferences/client";
import { trackPreferenceEvent } from "@/lib/preferences/analytics";
import {
  channelOptions,
  defaultQuickStyles,
  intentLabels,
  intentOptions,
  quickStyleById,
  quickStyleGroups,
  quickStyleRegistry,
  recipientLabels,
  recipientOptions,
  recommendedPreferences,
  type PreferenceChannel,
  type QuickStyleId,
  type UserPreferences,
} from "@/lib/preferences/registry";
import { channelLabels, type IntentType, type OutcomeVersionId, type RecipientType } from "@/lib/outcome-assistant/types";
import { PreferenceDialog } from "./PreferenceDialog";

export function SettingsClient({
  initialPreferences,
  preferencesAvailable,
}: {
  initialPreferences: UserPreferences;
  preferencesAvailable: boolean;
}) {
  const [saved, setSaved] = useState(initialPreferences);
  const [draft, setDraft] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(preferencesAvailable ? "" : "Preferences storage is not ready. Apply the Supabase migration, then retry.");
  const [replaceWith, setReplaceWith] = useState<QuickStyleId | null>(null);
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [draft, saved]);
  const replaceLabel = replaceWith ? quickStyleById[replaceWith].label : "this style";

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setQuickStyles(styles: QuickStyleId[]) {
    const defaultStyle = styles.includes(draft.rephrase.defaultStyle)
      ? draft.rephrase.defaultStyle
      : styles[0];
    setDraft((current) => ({ ...current, rephrase: { quickStyles: styles, defaultStyle } }));
  }

  function toggleStyle(style: QuickStyleId) {
    const current = draft.rephrase.quickStyles;
    if (current.includes(style)) {
      if (current.length === 1) return;
      setQuickStyles(current.filter((item) => item !== style));
      return;
    }
    if (current.length === 5) {
      setReplaceWith(style);
      return;
    }
    setError("");
    setQuickStyles([...current, style]);
  }

  function replaceStyle(existing: QuickStyleId) {
    if (!replaceWith) return;
    const quickStyles = draft.rephrase.quickStyles.map((style) =>
      style === existing ? replaceWith : style,
    );
    setDraft((current) => ({
      ...current,
      rephrase: {
        quickStyles,
        defaultStyle: current.rephrase.defaultStyle === existing
          ? replaceWith
          : current.rephrase.defaultStyle,
      },
    }));
    trackPreferenceEvent("quick_style_replaced", { modeId: replaceWith, selectedCount: 5, source: "settings" });
    setReplaceWith(null);
  }

  function moveStyle(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.rephrase.quickStyles.length) return;
    const styles = [...draft.rephrase.quickStyles];
    [styles[index], styles[nextIndex]] = [styles[nextIndex], styles[index]];
    setQuickStyles(styles);
    trackPreferenceEvent("quick_style_reordered", { modeId: styles[nextIndex], selectedCount: styles.length, source: "settings" });
  }

  function toggleRecipient(recipient: RecipientType) {
    const current = draft.outcomeAssistant.favoriteRecipients;
    if (!current.includes(recipient) && current.length === 4) {
      setError("Choose no more than four favorite recipients.");
      return;
    }
    setError("");
    setDraft((value) => ({
      ...value,
      outcomeAssistant: {
        ...value.outcomeAssistant,
        favoriteRecipients: current.includes(recipient)
          ? current.filter((item) => item !== recipient)
          : [...current, recipient],
      },
    }));
  }

  function toggleIntent(intent: IntentType) {
    const current = draft.outcomeAssistant.favoriteIntents;
    if (!current.includes(intent) && current.length === 6) {
      setError("Choose no more than six favorite goals.");
      return;
    }
    setError("");
    setDraft((value) => ({
      ...value,
      outcomeAssistant: {
        ...value.outcomeAssistant,
        favoriteIntents: current.includes(intent)
          ? current.filter((item) => item !== intent)
          : [...current, intent],
      },
    }));
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const state = await patchPreferences({
        rephrase: draft.rephrase,
        outcomeAssistant: draft.outcomeAssistant,
      });
      setSaved(state.preferences);
      setDraft(state.preferences);
      setStatus("Preferences saved.");
      trackPreferenceEvent("preferences_saved", { source: "settings" });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Preferences could not be saved.");
      trackPreferenceEvent("preferences_save_failed", { source: "settings" });
    } finally {
      setSaving(false);
    }
  }

  function resetRephrase() {
    setDraft((current) => ({
      ...current,
      rephrase: { quickStyles: [...defaultQuickStyles], defaultStyle: "professional" },
    }));
  }

  function resetOutcome() {
    const defaults = recommendedPreferences().outcomeAssistant;
    setDraft((current) => ({ ...current, outcomeAssistant: defaults }));
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-primary">
      <header className="border-b border-border-subtle bg-white/90 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link className="flex items-center gap-3" href="/workspace">
            <Image alt="ProPhrase" className="h-8 w-8 object-contain" height={32} src="/prophrase-logo-transparent.png" width={32} />
            <span className="text-xl font-bold">ProPhrase</span>
          </Link>
          <Link className="min-h-11 rounded-lg border border-border-subtle bg-white px-4 py-3 text-sm font-semibold" href="/workspace">Back to workspace</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_minmax(0,1fr)] md:px-8 md:py-12">
        <aside>
          <p className="text-xs font-semibold uppercase text-text-muted">App Settings</p>
          <nav className="mt-3 flex gap-2 overflow-x-auto md:flex-col" aria-label="Settings sections">
            <a className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white" href="#rephrase">Rephrase</a>
            <a className="min-h-11 shrink-0 rounded-lg px-4 py-3 text-sm font-semibold text-text-muted hover:bg-white" href="#outcome">Outcome Assistant</a>
          </nav>
        </aside>

        <div className="min-w-0">
          <header>
            <h1 className="text-3xl font-bold md:text-4xl">Writing preferences</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-text-muted">Keep your everyday choices close. Every style and shortcut remains available through More.</p>
          </header>

          <section className="mt-10 border-t border-border-subtle pt-8" id="rephrase">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Rephrase preferences</h2>
                <p className="mt-2 text-sm text-text-muted">Choose one to five Quick Styles and arrange their workspace order.</p>
              </div>
              <button className="min-h-11 text-sm font-semibold underline" onClick={resetRephrase} type="button">Reset recommended</button>
            </div>

            <div className="mt-6 grid gap-3" aria-label="Selected Quick Styles">
              {draft.rephrase.quickStyles.map((id, index) => (
                <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border-subtle bg-white px-4 py-3" key={id}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-container-low text-sm font-bold">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{quickStyleById[id].label}</span>
                    <span className="block truncate text-xs text-text-muted">{quickStyleById[id].description}</span>
                  </span>
                  <label className="flex min-h-10 items-center gap-2 text-xs font-semibold">
                    <input checked={draft.rephrase.defaultStyle === id} name="default-style" onChange={() => setDraft((current) => ({ ...current, rephrase: { ...current.rephrase, defaultStyle: id } }))} type="radio" /> Default
                  </label>
                  <button aria-label={`Move ${quickStyleById[id].label} up`} className="h-10 w-10 rounded-md border border-border-subtle disabled:opacity-30" disabled={index === 0} onClick={() => moveStyle(index, -1)} type="button">↑</button>
                  <button aria-label={`Move ${quickStyleById[id].label} down`} className="h-10 w-10 rounded-md border border-border-subtle disabled:opacity-30" disabled={index === draft.rephrase.quickStyles.length - 1} onClick={() => moveStyle(index, 1)} type="button">↓</button>
                </div>
              ))}
            </div>

            <div className="mt-7 grid gap-7 md:grid-cols-2">
              {quickStyleGroups.map((group) => (
                <fieldset key={group.id}>
                  <legend className="text-sm font-semibold text-text-muted">{group.label}</legend>
                  <div className="mt-3 grid gap-2">
                    {quickStyleRegistry.filter((style) => style.group === group.id).map((style) => {
                      const checked = draft.rephrase.quickStyles.includes(style.id);
                      return <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${checked ? "border-primary bg-white" : "border-border-subtle bg-white/50"}`} key={style.id}><input checked={checked} onChange={() => toggleStyle(style.id)} type="checkbox" /><span className="text-sm font-semibold">{style.label}</span></label>;
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <section className="mt-12 border-t border-border-subtle pt-8" id="outcome">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Outcome Assistant preferences</h2>
                <p className="mt-2 text-sm text-text-muted">Choose the people and goals you use most often.</p>
              </div>
              <button className="min-h-11 text-sm font-semibold underline" onClick={resetOutcome} type="button">Reset recommended</button>
            </div>

            <div className="mt-7 grid gap-8 md:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-semibold">Favorite recipients · {draft.outcomeAssistant.favoriteRecipients.length}/4</legend>
                <div className="mt-3 flex flex-wrap gap-2">{recipientOptions.map((recipient) => <label className={`cursor-pointer rounded-full border px-4 py-2.5 text-sm font-semibold ${draft.outcomeAssistant.favoriteRecipients.includes(recipient) ? "border-primary bg-primary text-white" : "border-border-subtle bg-white"}`} key={recipient}><input className="sr-only" checked={draft.outcomeAssistant.favoriteRecipients.includes(recipient)} onChange={() => toggleRecipient(recipient)} type="checkbox" />{recipientLabels[recipient]}</label>)}</div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold">Favorite goals · {draft.outcomeAssistant.favoriteIntents.length}/6</legend>
                <div className="mt-3 flex flex-wrap gap-2">{intentOptions.map((intent) => <label className={`cursor-pointer rounded-full border px-4 py-2.5 text-sm font-semibold ${draft.outcomeAssistant.favoriteIntents.includes(intent) ? "border-primary bg-primary text-white" : "border-border-subtle bg-white"}`} key={intent}><input className="sr-only" checked={draft.outcomeAssistant.favoriteIntents.includes(intent)} onChange={() => toggleIntent(intent)} type="checkbox" />{intentLabels[intent]}</label>)}</div>
              </fieldset>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">Default channel<select className="min-h-12 rounded-lg border border-border-subtle bg-white px-3" onChange={(event) => setDraft((current) => ({ ...current, outcomeAssistant: { ...current.outcomeAssistant, defaultChannel: event.target.value as PreferenceChannel } }))} value={draft.outcomeAssistant.defaultChannel}><option value="auto">Auto</option>{channelOptions.map((channel) => <option key={channel} value={channel}>{channelLabels[channel]}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-semibold">Default result<select className="min-h-12 rounded-lg border border-border-subtle bg-white px-3" onChange={(event) => setDraft((current) => ({ ...current, outcomeAssistant: { ...current.outcomeAssistant, defaultVariant: event.target.value as OutcomeVersionId } }))} value={draft.outcomeAssistant.defaultVariant}><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="firm">Firm</option></select></label>
            </div>
          </section>

          {error ? <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
          <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-4 border-t border-border-subtle bg-[#f7f6f2]/95 py-4 backdrop-blur">
            <p className="text-sm text-text-muted" aria-live="polite">{status || (dirty ? "Unsaved changes" : "Preferences are up to date")}</p>
            <button className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-white disabled:opacity-40" disabled={!dirty || saving || !preferencesAvailable} onClick={() => void save()} type="button">{saving ? "Saving..." : "Save preferences"}</button>
          </div>
        </div>
      </div>
      <PreferenceDialog open={Boolean(replaceWith)} onClose={() => setReplaceWith(null)} titleId="settings-replace-title">
          <div className="p-5">
            <h2 className="text-xl font-bold" id="settings-replace-title">Replace a Quick Style</h2>
            <p className="mt-2 text-sm text-text-muted">Choose which style to replace with {replaceLabel}. Its position will stay the same.</p>
            <div className="mt-5 grid gap-2">{draft.rephrase.quickStyles.map((style) => <button className="min-h-12 rounded-lg border border-border-subtle px-4 text-left text-sm font-semibold hover:bg-surface-container-low" key={style} onClick={() => replaceStyle(style)} type="button">{quickStyleById[style].label}</button>)}</div>
            <button className="mt-4 min-h-11 w-full rounded-lg bg-surface-container-low text-sm font-semibold" onClick={() => setReplaceWith(null)} type="button">Cancel</button>
          </div>
      </PreferenceDialog>
    </main>
  );
}
