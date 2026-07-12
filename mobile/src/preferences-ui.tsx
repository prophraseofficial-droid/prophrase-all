import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { updatePreferences } from "./api";
import { colors, shadow, spacing } from "./theme";
import type { PreferenceOptions, QuickStyleId, Tone, UserPreferences } from "./types";

const recommended: QuickStyleId[] = ["professional", "polite", "shorter", "human", "firmer"];

export function QuickStylesOnboardingScreen({ token, preferences, options, onComplete }: {
  token: string;
  preferences: UserPreferences;
  options: PreferenceOptions;
  onComplete: (preferences: UserPreferences) => void;
}) {
  const [selected, setSelected] = useState<QuickStyleId[]>(preferences.rephrase.quickStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: QuickStyleId) {
    setError("");
    setSelected((current) => current.includes(id)
      ? current.length === 1 ? current : current.filter((item) => item !== id)
      : current.length === 5 ? current : [...current, id]);
  }

  async function save(styles: QuickStyleId[]) {
    setBusy(true);
    setError("");
    try {
      const state = await updatePreferences({ token, patch: {
        onboardingCompleted: true,
        existingNoticeDismissed: true,
        rephrase: { quickStyles: styles, defaultStyle: styles[0] },
      } });
      onComplete(state.preferences);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your styles.");
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.onboardingScreen}>
    <ScrollView contentContainerStyle={styles.onboardingContent}>
      <Text style={styles.eyebrow}>WELCOME TO PROPHRASE</Text>
      <Text style={styles.title}>Make ProPhrase yours</Text>
      <Text style={styles.copy}>Choose the writing styles you use most. You can change them anytime.</Text>
      <Text accessibilityLiveRegion="polite" style={styles.count}>{selected.length} of 5 selected</Text>
      {options.quickStyleGroups.map((group) => <View key={group.id} style={styles.group}>
        <Text style={styles.groupTitle}>{group.label}</Text>
        {options.quickStyles.filter((style) => style.group === group.id).map((style) => {
          const active = selected.includes(style.id);
          const disabled = !active && selected.length === 5;
          return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled || busy} key={style.id} onPress={() => toggle(style.id)} style={[styles.option, active && styles.optionActive, disabled && styles.disabled]}>
            <View style={styles.optionCopy}><Text style={[styles.optionTitle, active && styles.optionTextActive]}>{style.label}</Text><Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{style.description}</Text></View>
            <Text style={[styles.optionMark, active && styles.optionTextActive]}>{active ? "✓" : "+"}</Text>
          </Pressable>;
        })}
      </View>)}
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={() => void save(selected)} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Saving..." : "Continue to Rephrase"}</Text></Pressable>
      <Pressable disabled={busy} onPress={() => setSelected([...recommended])} style={styles.secondary}><Text style={styles.secondaryText}>Use recommended</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void save([...recommended])} style={styles.linkButton}><Text style={styles.linkText}>Skip for now</Text></Pressable>
    </ScrollView>
  </View>;
}

export function QuickStylesPicker({ token, preferences, options, selectedTone, onSelect, onUpdate }: {
  token: string;
  preferences: UserPreferences;
  options: PreferenceOptions;
  selectedTone: Tone;
  onSelect: (tone: Tone) => void;
  onUpdate: (preferences: UserPreferences) => void;
}) {
  const [open, setOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<QuickStyleId | null>(null);
  const byId = Object.fromEntries(options.quickStyles.map((style) => [style.id, style]));
  const active = options.quickStyles.find((style) => style.tone === selectedTone);

  async function persist(next: QuickStyleId[], defaultStyle = preferences.rephrase.defaultStyle) {
    const state = await updatePreferences({ token, patch: { rephrase: { quickStyles: next, defaultStyle } } });
    onUpdate(state.preferences);
  }

  async function pin(id: QuickStyleId) {
    if (preferences.rephrase.quickStyles.includes(id)) return;
    if (preferences.rephrase.quickStyles.length === 5) { setReplaceId(id); return; }
    await persist([...preferences.rephrase.quickStyles, id]);
  }

  async function replace(existing: QuickStyleId) {
    if (!replaceId) return;
    const next = preferences.rephrase.quickStyles.map((id) => id === existing ? replaceId : id);
    const defaultStyle = preferences.rephrase.defaultStyle === existing ? replaceId : preferences.rephrase.defaultStyle;
    await persist(next, defaultStyle);
    setReplaceId(null);
  }

  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
      {preferences.rephrase.quickStyles.map((id) => <Pressable key={id} onPress={() => onSelect(byId[id].tone)} style={[styles.quickChip, selectedTone === byId[id].tone && styles.quickChipActive]}><Text style={[styles.quickChipText, selectedTone === byId[id].tone && styles.quickChipTextActive]}>{byId[id].label}</Text></Pressable>)}
      <Pressable onPress={() => setOpen(true)} style={styles.quickChip}><Text style={styles.quickChipText}>More</Text></Pressable>
    </ScrollView>
    <Modal animationType="slide" transparent visible={open} onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
      <View style={styles.sheet}><View style={styles.handle} /><Text style={styles.sheetTitle}>All styles</Text><ScrollView>{options.quickStyleGroups.map((group) => <View key={group.id}><Text style={styles.groupTitle}>{group.label}</Text>{options.quickStyles.filter((item) => item.group === group.id).map((item) => <Pressable key={item.id} onPress={() => { onSelect(item.tone); setOpen(false); }} style={[styles.sheetRow, active?.id === item.id && styles.sheetRowActive]}><View style={styles.optionCopy}><Text style={styles.optionTitle}>{item.label}</Text><Text style={styles.optionMeta}>{item.description}</Text></View>{active?.id === item.id && !preferences.rephrase.quickStyles.includes(item.id) ? <Pressable onPress={() => void pin(item.id)} style={styles.pin}><Text style={styles.pinText}>Pin</Text></Pressable> : null}</Pressable>)}</View>)}</ScrollView></View>
    </Modal>
    <Modal animationType="fade" transparent visible={Boolean(replaceId)} onRequestClose={() => setReplaceId(null)}><View style={styles.modalCenter}><View style={styles.replaceCard}><Text style={styles.sheetTitle}>Replace a Quick Style</Text><Text style={styles.copy}>Choose the style to replace.</Text>{preferences.rephrase.quickStyles.map((id) => <Pressable key={id} onPress={() => void replace(id)} style={styles.replaceRow}><Text style={styles.optionTitle}>{byId[id].label}</Text></Pressable>)}<Pressable onPress={() => setReplaceId(null)} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View></Modal>
  </>;
}

export function PreferenceSettingsPanel({ token, preferences, options, onUpdate }: {
  token: string;
  preferences: UserPreferences;
  options: PreferenceOptions;
  onUpdate: (preferences: UserPreferences) => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const byId = Object.fromEntries(options.quickStyles.map((style) => [style.id, style]));

  function toggleStyle(id: QuickStyleId) {
    const current = draft.rephrase.quickStyles;
    if (current.includes(id)) {
      if (current.length === 1) return;
      const next = current.filter((item) => item !== id);
      setDraft((value) => ({ ...value, rephrase: { quickStyles: next, defaultStyle: next.includes(value.rephrase.defaultStyle) ? value.rephrase.defaultStyle : next[0] } }));
    } else if (current.length < 5) setDraft((value) => ({ ...value, rephrase: { ...value.rephrase, quickStyles: [...current, id] } }));
  }

  function moveStyle(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.rephrase.quickStyles.length) return;
    const quickStyles = [...draft.rephrase.quickStyles];
    [quickStyles[index], quickStyles[nextIndex]] = [quickStyles[nextIndex], quickStyles[index]];
    setDraft((value) => ({ ...value, rephrase: { ...value.rephrase, quickStyles } }));
  }

  function toggleRecipient(id: UserPreferences["outcomeAssistant"]["favoriteRecipients"][number]) {
    const current = draft.outcomeAssistant.favoriteRecipients;
    if (!current.includes(id) && current.length === 4) { setStatus("Choose no more than four recipients."); return; }
    setStatus("");
    setDraft((value) => ({ ...value, outcomeAssistant: { ...value.outcomeAssistant, favoriteRecipients: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] } }));
  }

  function toggleIntent(id: UserPreferences["outcomeAssistant"]["favoriteIntents"][number]) {
    const current = draft.outcomeAssistant.favoriteIntents;
    if (!current.includes(id) && current.length === 6) { setStatus("Choose no more than six goals."); return; }
    setStatus("");
    setDraft((value) => ({ ...value, outcomeAssistant: { ...value.outcomeAssistant, favoriteIntents: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] } }));
  }

  async function save() {
    setBusy(true); setStatus("");
    try { const state = await updatePreferences({ token, patch: { rephrase: draft.rephrase, outcomeAssistant: draft.outcomeAssistant } }); onUpdate(state.preferences); setDraft(state.preferences); setStatus("Preferences saved."); }
    catch (caught) { setStatus(caught instanceof Error ? caught.message : "Save failed."); }
    finally { setBusy(false); }
  }

  return <View style={styles.settingsPanel}>
    <Text style={styles.sectionTitle}>Quick Styles · {draft.rephrase.quickStyles.length}/5</Text>
    {draft.rephrase.quickStyles.map((id, index) => <View key={id} style={styles.reorderRow}><Text style={styles.reorderLabel}>{index + 1}. {byId[id].label}</Text><Pressable accessibilityLabel={`Move ${byId[id].label} up`} disabled={index === 0} onPress={() => moveStyle(index, -1)} style={[styles.moveButton, index === 0 && styles.disabled]}><Text>↑</Text></Pressable><Pressable accessibilityLabel={`Move ${byId[id].label} down`} disabled={index === draft.rephrase.quickStyles.length - 1} onPress={() => moveStyle(index, 1)} style={[styles.moveButton, index === draft.rephrase.quickStyles.length - 1 && styles.disabled]}><Text>↓</Text></Pressable></View>)}
    <View style={styles.wrap}>{options.quickStyles.map((item) => <Pressable key={item.id} onPress={() => toggleStyle(item.id)} style={[styles.quickChip, draft.rephrase.quickStyles.includes(item.id) && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.rephrase.quickStyles.includes(item.id) && styles.quickChipTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>Default style</Text>
    <View style={styles.wrap}>{draft.rephrase.quickStyles.map((id) => <Pressable key={id} onPress={() => setDraft((value) => ({ ...value, rephrase: { ...value.rephrase, defaultStyle: id } }))} style={[styles.quickChip, draft.rephrase.defaultStyle === id && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.rephrase.defaultStyle === id && styles.quickChipTextActive]}>{byId[id].label}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>Favorite recipients · {draft.outcomeAssistant.favoriteRecipients.length}/4</Text>
    <View style={styles.wrap}>{options.recipients.map((item) => <Pressable key={item.id} onPress={() => toggleRecipient(item.id)} style={[styles.quickChip, draft.outcomeAssistant.favoriteRecipients.includes(item.id) && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.outcomeAssistant.favoriteRecipients.includes(item.id) && styles.quickChipTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>Favorite goals · {draft.outcomeAssistant.favoriteIntents.length}/6</Text>
    <View style={styles.wrap}>{options.intents.map((item) => <Pressable key={item.id} onPress={() => toggleIntent(item.id)} style={[styles.quickChip, draft.outcomeAssistant.favoriteIntents.includes(item.id) && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.outcomeAssistant.favoriteIntents.includes(item.id) && styles.quickChipTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>Default channel</Text>
    <View style={styles.wrap}><Pressable onPress={() => setDraft((value) => ({ ...value, outcomeAssistant: { ...value.outcomeAssistant, defaultChannel: "auto" } }))} style={[styles.quickChip, draft.outcomeAssistant.defaultChannel === "auto" && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.outcomeAssistant.defaultChannel === "auto" && styles.quickChipTextActive]}>Auto</Text></Pressable>{options.channels.map((item) => <Pressable key={item.id} onPress={() => setDraft((value) => ({ ...value, outcomeAssistant: { ...value.outcomeAssistant, defaultChannel: item.id } }))} style={[styles.quickChip, draft.outcomeAssistant.defaultChannel === item.id && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.outcomeAssistant.defaultChannel === item.id && styles.quickChipTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>Default result</Text>
    <View style={styles.wrap}>{(["safe", "balanced", "firm"] as const).map((id) => <Pressable key={id} onPress={() => setDraft((value) => ({ ...value, outcomeAssistant: { ...value.outcomeAssistant, defaultVariant: id } }))} style={[styles.quickChip, draft.outcomeAssistant.defaultVariant === id && styles.quickChipActive]}><Text style={[styles.quickChipText, draft.outcomeAssistant.defaultVariant === id && styles.quickChipTextActive]}>{id[0].toUpperCase() + id.slice(1)}</Text></Pressable>)}</View>
    <Pressable disabled={busy} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Saving..." : "Save preferences"}</Text></Pressable>
    {status ? <Text accessibilityLiveRegion="polite" style={status.includes("saved") ? styles.success : styles.error}>{status}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  onboardingScreen: { flex: 1, backgroundColor: colors.surface }, onboardingContent: { padding: spacing.screen, paddingBottom: 48 }, eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1 }, title: { color: colors.text, fontSize: 38, fontWeight: "800", marginTop: 14 }, copy: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 12 }, count: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 24 }, group: { marginTop: 24 }, groupTitle: { color: colors.muted, fontSize: 13, fontWeight: "700", marginBottom: 10 }, option: { alignItems: "center", backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", minHeight: 64, padding: 14, marginBottom: 8 }, optionActive: { backgroundColor: colors.primary, borderColor: colors.primary }, optionCopy: { flex: 1 }, optionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" }, optionMeta: { color: colors.muted, fontSize: 12, marginTop: 4 }, optionTextActive: { color: "#fff" }, optionMetaActive: { color: "rgba(255,255,255,.72)" }, optionMark: { color: colors.text, fontSize: 20, fontWeight: "700" }, disabled: { opacity: .42 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 14 }, success: { color: colors.success, fontSize: 13, marginTop: 12 }, primary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, minHeight: 50, justifyContent: "center", marginTop: 24 }, primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" }, secondary: { alignItems: "center", backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 48, justifyContent: "center", marginTop: 10 }, secondaryText: { color: colors.text, fontSize: 14, fontWeight: "700" }, linkButton: { alignItems: "center", minHeight: 48, justifyContent: "center" }, linkText: { color: colors.muted, fontSize: 14, fontWeight: "600" }, quickRow: { gap: 8, paddingHorizontal: spacing.screen, paddingVertical: 12 }, quickChip: { alignItems: "center", backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 14 }, quickChipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, quickChipText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, quickChipTextActive: { color: "#fff" }, backdrop: { backgroundColor: "rgba(0,0,0,.24)", flex: 1 }, sheet: { backgroundColor: colors.surfaceCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, bottom: 0, left: 0, maxHeight: "80%", padding: spacing.screen, position: "absolute", right: 0 }, handle: { alignSelf: "center", backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: 18, width: 42 }, sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 14 }, sheetRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 62, paddingVertical: 10 }, sheetRowActive: { backgroundColor: colors.surfaceLow }, pin: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }, pinText: { color: "#fff", fontSize: 12, fontWeight: "700" }, modalCenter: { alignItems: "center", backgroundColor: "rgba(0,0,0,.28)", flex: 1, justifyContent: "center", padding: spacing.screen }, replaceCard: { backgroundColor: colors.surfaceCard, borderRadius: 14, padding: 20, width: "100%", ...shadow }, replaceRow: { borderBottomColor: colors.border, borderBottomWidth: 1, minHeight: 48, justifyContent: "center" }, settingsPanel: { marginTop: 26 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 12, marginTop: 18 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, reorderRow: { alignItems: "center", backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", marginBottom: 8, minHeight: 48, paddingHorizontal: 12 }, reorderLabel: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700" }, moveButton: { alignItems: "center", borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 36, justifyContent: "center", marginLeft: 8, width: 36 },
});
