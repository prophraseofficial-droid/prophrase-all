import { useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { prepareOutcomeMessage } from "./api";
import { colors, shadow, spacing } from "./theme";
import type { AppSession, IntentType, PreferenceOptions, RecipientType, UserPreferences } from "./types";

type SelectorKind = "recipient" | "intent" | null;

export function OutcomeScreen({ session, preferences, options }: {
  session: AppSession;
  preferences: UserPreferences;
  options: PreferenceOptions;
}) {
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<RecipientType | null>(null);
  const [intent, setIntent] = useState<IntentType | null>(null);
  const [selector, setSelector] = useState<SelectorKind>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const insets = useSafeAreaInsets();
  const [variants, setVariants] = useState<Array<{ id: string; label: string; message: string; readerInterpretation: string }>>([]);
  const [selectedVariant, setSelectedVariant] = useState(preferences.outcomeAssistant.defaultVariant);
  const recipientById = Object.fromEntries(options.recipients.map((item) => [item.id, item]));
  const intentById = Object.fromEntries(options.intents.map((item) => [item.id, item]));
  const selectorOptions = useMemo(() => {
    const values = selector === "recipient" ? options.recipients : options.intents;
    return values.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()));
  }, [options.intents, options.recipients, search, selector]);

  async function generate() {
    if (message.trim().length < 3) { setError("Enter the message you want to prepare."); return; }
    if (!recipient) { setError("Choose who you are sending this to."); return; }
    if (!intent) { setError("Choose what you want this message to achieve."); return; }
    setLoading(true); setError("");
    try {
      const response = await prepareOutcomeMessage({
        token: session.accessToken,
        originalText: message.trim(),
        recipient,
        intent,
        channel: preferences.outcomeAssistant.defaultChannel === "auto" ? "email" : preferences.outcomeAssistant.defaultChannel,
      });
      setVariants(response.variants);
      setSelectedVariant(preferences.outcomeAssistant.defaultVariant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare your message.");
    } finally { setLoading(false); }
  }

  async function copySelectedVariant() {
    const selected = variants.find((variant) => variant.id === selectedVariant);
    if (!selected) return;
    await Clipboard.setStringAsync(selected.message);
    setStatus("Copied to this phone.");
  }

  const visibleRecipients = recipient && !preferences.outcomeAssistant.favoriteRecipients.includes(recipient)
    ? [...preferences.outcomeAssistant.favoriteRecipients, recipient]
    : preferences.outcomeAssistant.favoriteRecipients;
  const visibleIntents = intent && !preferences.outcomeAssistant.favoriteIntents.includes(intent)
    ? [...preferences.outcomeAssistant.favoriteIntents, intent]
    : preferences.outcomeAssistant.favoriteIntents;

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.headerTitle}>Outcome Assistant</Text><Text style={styles.headerCopy}>Prepare the right message</Text></View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
    <ScrollView contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.composer}>
        <Text style={styles.label}>WHAT DO YOU WANT TO SAY?</Text>
        <TextInput multiline maxLength={5000} onChangeText={setMessage} placeholder="Type or speak naturally..." placeholderTextColor={colors.muted} style={styles.messageInput} textAlignVertical="top" value={message} />
        <Text style={styles.counter}>{message.length}/5000</Text>
      </View>

      <Text style={styles.sectionTitle}>Who are you sending this to?</Text>
      <View style={styles.wrap}>{visibleRecipients.map((id) => <Pressable key={id} onPress={() => setRecipient(id)} style={[styles.chip, recipient === id && styles.chipActive]}><Text style={[styles.chipText, recipient === id && styles.chipTextActive]}>{recipientById[id]?.label ?? id}</Text></Pressable>)}<Pressable onPress={() => { setSearch(""); setSelector("recipient"); }} style={styles.chip}><Text style={styles.chipText}>More</Text></Pressable></View>

      <Text style={styles.sectionTitle}>What should this message achieve?</Text>
      <View style={styles.wrap}>{visibleIntents.map((id) => <Pressable key={id} onPress={() => setIntent(id)} style={[styles.chip, intent === id && styles.chipActive]}><Text style={[styles.chipText, intent === id && styles.chipTextActive]}>{intentById[id]?.label ?? id}</Text></Pressable>)}<Pressable onPress={() => { setSearch(""); setSelector("intent"); }} style={styles.chip}><Text style={styles.chipText}>More</Text></Pressable></View>

      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <Pressable disabled={loading} onPress={() => void generate()} style={[styles.primary, loading && styles.disabled]}><Text style={styles.primaryText}>{loading ? "Preparing..." : "Prepare my message"}</Text></Pressable>

      {variants.length ? <View style={styles.results}><Text style={styles.resultsTitle}>Choose your result</Text><View style={styles.variantTabs}>{variants.map((variant) => <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedVariant === variant.id }} key={variant.id} onPress={() => { setSelectedVariant(variant.id as "safe" | "balanced" | "firm"); setStatus(""); }} style={[styles.variantTab, selectedVariant === variant.id && styles.variantTabActive]}><Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.variantTabText, selectedVariant === variant.id && styles.variantTabTextActive]}>{variant.label}</Text></Pressable>)}</View>{variants.filter((variant) => variant.id === selectedVariant).map((variant) => <View style={styles.resultCard} key={variant.id}><Text style={styles.resultMessage}>{variant.message}</Text><Text style={styles.readerLabel}>How it may read</Text><Text style={styles.readerCopy}>{variant.readerInterpretation}</Text><Pressable accessibilityRole="button" onPress={() => void copySelectedVariant()} style={styles.copyButton}><Text style={styles.copyButtonText}>Copy</Text></Pressable>{status ? <Text style={styles.status}>{status}</Text> : null}</View>)}</View> : null}
    </ScrollView>
    </KeyboardAvoidingView>

    <Modal animationType="slide" transparent visible={Boolean(selector)} onRequestClose={() => setSelector(null)}><Pressable style={styles.backdrop} onPress={() => setSelector(null)} /><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none" style={styles.modalKeyboard}><View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.screen) }]}><View style={styles.handle} /><Text style={styles.sheetTitle}>{selector === "recipient" ? "Choose a recipient" : "Choose a goal"}</Text><TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.muted} style={styles.search} value={search} /><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{selectorOptions.map((item) => <Pressable key={item.id} onPress={() => { if (selector === "recipient") setRecipient(item.id as RecipientType); else setIntent(item.id as IntentType); setSelector(null); }} style={styles.sheetRow}><Text style={styles.sheetRowText}>{item.label}</Text></Pressable>)}</ScrollView></View></KeyboardAvoidingView></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.screen,
    paddingVertical: 16,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  headerCopy: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  content: {
    alignSelf: "center",
    maxWidth: 720,
    padding: spacing.screen,
    paddingBottom: 120,
    width: "100%",
  },
  composer: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  messageInput: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 150,
    marginTop: 12,
  },
  counter: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "right",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    marginTop: 26,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
  },
  primary: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 52,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  results: {
    marginTop: 32,
  },
  resultsTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  variantTabs: {
    backgroundColor: colors.surfaceLow,
    borderRadius: 10,
    flexDirection: "row",
    marginTop: 14,
    padding: 4,
  },
  variantTab: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  variantTabActive: {
    backgroundColor: colors.primary,
  },
  variantTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  variantTabTextActive: {
    color: "#fff",
  },
  resultCard: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 18,
    ...shadow,
  },
  resultMessage: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  readerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 20,
  },
  readerCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  copyButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 44,
  },
  copyButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  status: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,.24)",
    flex: 1,
  },
  modalKeyboard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "78%",
    padding: spacing.screen,
    width: "100%",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    marginBottom: 18,
    width: 42,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  search: {
    backgroundColor: colors.surfaceLow,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    minHeight: 48,
    marginVertical: 14,
    paddingHorizontal: 14,
  },
  sheetRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 10,
  },
  sheetRowText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
