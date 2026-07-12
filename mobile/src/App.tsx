import { StatusBar } from "expo-status-bar";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  createUniversalCopy,
  loadThread,
  loadWorkspace,
  pricingUrl,
  rewriteMessage,
} from "./api";
import { appConfig } from "./config";
import { getDeviceLabel, getOrCreateDeviceId } from "./device";
import { supabase } from "./supabase";
import { colors, shadow, spacing } from "./theme";
import type {
  AppSession,
  RewriteTemplate,
  ThreadMessage,
  ThreadSummary,
  Tone,
  UsageSummary,
  ViewName,
} from "./types";

WebBrowser.maybeCompleteAuthSession();

const tones: Tone[] = [
  "Professional",
  "Short & Crisp",
  "Human",
  "Email",
  "Jira Comment",
];

const bugTemplate: RewriteTemplate = {
  id: "bug-update-mobile",
  title: "Bug update",
  category: "Engineering",
  tone: "Jira Comment",
  body:
    "I found the issue and am working on the fix now. I will share an update once the patch is ready for review.",
};

function getAuthRedirectUrl() {
  if (appConfig.authRedirectUrl) return appConfig.authRedirectUrl;

  return makeRedirectUri({
    scheme: "prophrase",
    path: "auth/callback",
  });
}

function initialFromName(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function formatPlan(plan?: UsageSummary["plan"]) {
  if (plan === "plus") return "Plus";
  if (plan === "pro") return "Pro";
  if (plan === "pro_yearly") return "Pro Yearly";
  if (plan === "pro_monthly") return "Pro Monthly";
  return "Free";
}

function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "accent";
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "ghost" && styles.ghostButton,
        variant === "accent" && styles.accentButton,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" || variant === "ghost"
            ? styles.secondaryButtonText
            : null,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function GoogleButton({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel="Continue with Google"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.googleButton,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.googleMark}>
        <Text style={styles.googleMarkText}>G</Text>
      </View>
      <Text style={styles.googleButtonText}>
        {loading ? "Connecting to Google..." : "Continue with Google"}
      </Text>
      <View style={styles.googleButtonSpacer} />
    </Pressable>
  );
}

function AppLogo({ size = 44 }: { size?: number }) {
  return (
    <View
      style={[
        styles.logoMark,
        { height: size, width: size, borderRadius: Math.max(10, size * 0.24) },
      ]}
    >
      <Text style={[styles.logoText, { fontSize: size * 0.62 }]}>P</Text>
    </View>
  );
}

function Shell({
  children,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </SafeAreaView>
  );
}

function SplashScreen() {
  return (
    <SafeAreaView style={[styles.safe, styles.centerScreen]}>
      <View style={styles.splashGlow}>
        <AppLogo size={78} />
      </View>
      <Text style={styles.splashTitle}>ProPhrase</Text>
      <Text style={styles.splashSubtitle}>Say it better at work.</Text>
    </SafeAreaView>
  );
}

function OnboardingValueProp({ onNext }: { onNext: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.onboarding}>
        <AppLogo />
        <Text style={styles.heroTitle}>Write clearly without slowing down.</Text>
        <Text style={styles.heroCopy}>
          Turn rough updates, emails, Jira comments, and replies into polished work
          messages in one tap.
        </Text>
        <View style={styles.demoCard}>
          <Text style={styles.label}>ROUGH MESSAGE</Text>
          <Text style={styles.demoText}>
            need eyes on this pr customer wants fix in 6.6
          </Text>
          <View style={styles.divider} />
          <Text style={styles.label}>PROPHRASE OUTPUT</Text>
          <Text style={styles.demoOutput}>
            Please review this PR. The customer requested the fix for version
            6.6, so we created the PR accordingly.
          </Text>
        </View>
        <Button title="Continue" onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}

function OnboardingToneChoice({
  selectedTone,
  onSelect,
  onNext,
}: {
  selectedTone: Tone;
  onSelect: (tone: Tone) => void;
  onNext: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.onboarding}>
        <Text style={styles.step}>Step 2 of 3</Text>
        <Text style={styles.heroTitle}>Choose your default tone.</Text>
        <Text style={styles.heroCopy}>
          You can switch anytime, but this helps ProPhrase feel like your voice from
          the first rewrite.
        </Text>
        <View style={styles.toneGrid}>
          {tones.map((tone) => (
            <Pressable
              key={tone}
              onPress={() => onSelect(tone)}
              style={[
                styles.tonePill,
                selectedTone === tone ? styles.tonePillActive : null,
              ]}
            >
              <Text
                style={[
                  styles.tonePillText,
                  selectedTone === tone ? styles.tonePillTextActive : null,
                ]}
              >
                {tone}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button title="Use this tone" onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}

function OnboardingGetStarted({
  email,
  setEmail,
  authLoading,
  onGoogle,
  onStart,
}: {
  email: string;
  setEmail: (email: string) => void;
  authLoading: "google" | "magic" | null;
  onGoogle: () => void;
  onStart: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.onboarding}
      >
        <Text style={styles.step}>Step 3 of 3</Text>
        <Text style={styles.heroTitle}>Start rewriting from your phone.</Text>
        <Text style={styles.heroCopy}>
          Sign in with the same ProPhrase account to sync history, templates, usage,
          and Universal Copy.
        </Text>
        <GoogleButton
          disabled={authLoading !== null}
          loading={authLoading === "google"}
          onPress={onGoogle}
        />
        <View style={styles.authDivider}>
          <View style={styles.authDividerLine} />
          <Text style={styles.authDividerText}>or continue with email</Text>
          <View style={styles.authDividerLine} />
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="prophraseofficial@gmail.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        <Button
          disabled={authLoading !== null || !email.trim()}
          title={authLoading === "magic" ? "Sending magic link..." : "Send magic link"}
          onPress={onStart}
        />
        <Text style={styles.finePrint}>
          Mobile uses Supabase secure sessions. Your API keys stay on the server.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ToneSelectionSheet({
  visible,
  tone,
  onSelect,
  onClose,
}: {
  visible: boolean;
  tone: Tone;
  onSelect: (tone: Tone) => void;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Tone</Text>
        {tones.map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              onSelect(item);
              onClose();
            }}
            style={[styles.sheetRow, item === tone ? styles.sheetRowActive : null]}
          >
            <Text style={styles.sheetRowTitle}>{item}</Text>
            <Text style={styles.sheetRowMeta}>
              {item === "Professional"
                ? "Clear and polished"
                : item === "Short & Crisp"
                  ? "Concise and direct"
                  : item === "Human"
                    ? "Warm and natural"
                    : item === "Email"
                      ? "Ready for inboxes"
                      : "Ticket-friendly"}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function LimitReachedModal({
  visible,
  message,
  onUpgrade,
  onClose,
}: {
  visible: boolean;
  message: string;
  onUpgrade: () => void;
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.modalCenter}>
        <View style={styles.alertCard}>
          <Text style={styles.alertIcon}>!</Text>
          <Text style={styles.alertTitle}>Limit reached</Text>
          <Text style={styles.alertCopy}>{message}</Text>
          <Button title="Upgrade" onPress={onUpgrade} />
          <Button title="Maybe later" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function UpgradeFlow({
  visible,
  busy,
  onSelect,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  onSelect: (plan: "plus" | "pro", interval: "monthly" | "annual") => void;
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  return (
    <Modal animationType="slide" transparent visible={visible}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Choose a plan</Text>
        <Text style={styles.sheetCopy}>
          Longer messages use more credits. Unused credits do not roll over.
        </Text>
        <View style={styles.toneRow}>
          <Pressable onPress={() => setInterval("monthly")} style={[styles.chip, interval === "monthly" && styles.chipActive]}><Text style={[styles.chipText, interval === "monthly" && styles.chipTextActive]}>Monthly</Text></Pressable>
          <Pressable onPress={() => setInterval("annual")} style={[styles.chip, interval === "annual" && styles.chipActive]}><Text style={[styles.chipText, interval === "annual" && styles.chipTextActive]}>Annual</Text></Pressable>
        </View>
        <Pressable
          disabled={busy}
          onPress={() => onSelect("plus", interval)}
          style={styles.planCard}
        >
          <Text style={styles.planName}>Plus</Text>
          <Text style={styles.planPrice}>{interval === "monthly" ? "₹99/month" : "₹899/year"}</Text>
          <Text style={styles.planMeta}>300 credits refreshed monthly.</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => onSelect("pro", interval)}
          style={[styles.planCard, styles.planCardFeatured]}
        >
          <Text style={styles.planName}>Pro</Text>
          <Text style={styles.planPrice}>{interval === "monthly" ? "₹249/month" : "₹1,999/year"}</Text>
          <Text style={styles.planMeta}>1,500 credits refreshed monthly.</Text>
        </Pressable>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
    </Modal>
  );
}

function HomeWrite({
  session,
  selectedTone,
  setSelectedTone,
  usage,
  setUsage,
  threads,
  setThreads,
  setView,
  deviceId,
  deviceLabel,
  onOpenUpgrade,
  templateDraft,
  onTemplateDraftUsed,
  planFeatureGatingEnabled,
}: {
  session: AppSession;
  selectedTone: Tone;
  setSelectedTone: (tone: Tone) => void;
  usage: UsageSummary | null;
  setUsage: (usage: UsageSummary) => void;
  threads: ThreadSummary[];
  setThreads: (threads: ThreadSummary[]) => void;
  setView: (view: ViewName) => void;
  deviceId: string;
  deviceLabel: string;
  onOpenUpgrade: (message?: string) => void;
  templateDraft: RewriteTemplate | null;
  onTemplateDraftUsed: () => void;
  planFeatureGatingEnabled: boolean;
}) {
  const [text, setText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [result, setResult] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [toneSheetOpen, setToneSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!templateDraft) return;
    setText(templateDraft.body);
    setSelectedTone(templateDraft.tone);
    setSourceText("");
    setResult("");
    setThreadId(null);
    onTemplateDraftUsed();
  }, [onTemplateDraftUsed, setSelectedTone, templateDraft]);

  async function handleRewrite() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (
      planFeatureGatingEnabled &&
      !["plus", "pro", "pro_monthly", "pro_yearly"].includes(usage?.creditBalance?.plan ?? usage?.plan ?? "free") &&
      !["Professional", "Polite", "Shorter"].includes(selectedTone)
    ) {
      onOpenUpgrade(`${selectedTone} is available on Plus and Pro.`);
      return;
    }
    if (usage?.creditBalance && usage.creditBalance.available <= 0) {
      onOpenUpgrade("You have no credits remaining for this credit period.");
      return;
    }
    if (usage && !usage.creditBalance && !usage.isPro && usage.rewriteRemaining <= 0) {
      onOpenUpgrade("You have used your free rewrites for today.");
      return;
    }

    setLoading(true);
    setStatus("Polishing your message...");
    setSourceText(trimmed);
    try {
      const data = await rewriteMessage({
        token: session.accessToken,
        text: trimmed,
        tone: selectedTone,
        threadId,
      });
      setThreadId(data.threadId);
      setResult(data.result);
      setUsage({
        ...data.usage,
        creditBalance: data.credits && usage?.creditBalance
          ? { ...usage.creditBalance, available: data.credits.remaining, nextRefreshAt: data.credits.nextRefreshAt }
          : usage?.creditBalance ?? null,
      });
      setThreads([data.thread, ...threads.filter((item) => item.id !== data.thread.id)]);
      setText("");
      setStatus("");
    } catch (error) {
      const payload = (error as Error & { payload?: { message?: string } }).payload;
      onOpenUpgrade(payload?.message || "Unable to rewrite message right now.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await Clipboard.setStringAsync(result);
    setStatus("Copied to this phone.");
  }

  async function universalCopy() {
    if (!result) return;
    setLoading(true);
    try {
      await createUniversalCopy({
        token: session.accessToken,
        deviceId,
        deviceLabel,
        text: result,
      });
      await Clipboard.setStringAsync(result);
      setStatus("Universal copy ready for one trusted device.");
    } catch {
      setStatus("Universal copy could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell
      title="Write"
      subtitle={usage?.creditBalance ? `${usage.creditBalance.available} credits left` : usage?.isPro ? "Paid workspace" : `${usage?.rewriteRemaining ?? 0} rewrites left`}
      right={
        <Pressable style={styles.avatar} onPress={() => setView("settings")}>
          <Text style={styles.avatarText}>{initialFromName(session.name)}</Text>
        </Pressable>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={styles.toneSelector} onPress={() => setToneSheetOpen(true)}>
            <Text style={styles.toneSelectorLabel}>Tone</Text>
            <Text style={styles.toneSelectorValue}>{selectedTone}</Text>
          </Pressable>

          <View style={styles.writeCard}>
            <Text style={styles.label}>ROUGH MESSAGE</Text>
            <TextInput
              multiline
              onChangeText={setText}
              placeholder="Type what you want to say..."
              placeholderTextColor={colors.muted}
              style={styles.messageInput}
              textAlignVertical="top"
              value={text}
            />
            <Button
              disabled={loading || !text.trim()}
              title={loading ? "Rewriting..." : "Rewrite"}
              onPress={handleRewrite}
            />
          </View>

          {sourceText || result || loading ? (
            <View style={styles.outputWrap}>
              <Text style={styles.sectionTitle}>Output: Result</Text>
              {sourceText ? (
                <View style={styles.userBubble}>
                  <Text style={styles.bubbleText}>{sourceText}</Text>
                </View>
              ) : null}
              <View style={styles.aiBubble}>
                <Text style={styles.label}>PROPHRASE AI</Text>
                {loading && !result ? (
                  <Text style={styles.resultText}>Finding the cleanest phrasing...</Text>
                ) : (
                  <Text style={styles.resultText}>{result}</Text>
                )}
                {result ? (
                  <View style={styles.outputActions}>
                    <Button title="Copy" variant="secondary" onPress={copyResult} />
                    <Button
                      title="Copy Universal"
                      variant="accent"
                      disabled={loading}
                      onPress={universalCopy}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ToneSelectionSheet
        visible={toneSheetOpen}
        tone={selectedTone}
        onSelect={setSelectedTone}
        onClose={() => setToneSheetOpen(false)}
      />
    </Shell>
  );
}

function HistoryScreen({
  token,
  threads,
}: {
  token: string;
  threads: ThreadSummary[];
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [activeTitle, setActiveTitle] = useState("Recent rewrites");
  const [loading, setLoading] = useState(false);

  async function openThread(thread: ThreadSummary) {
    setLoading(true);
    setActiveTitle(thread.title || "Rewrite");
    try {
      const data = await loadThread(token, thread.id);
      setMessages(data.messages);
    } catch {
      Alert.alert("Unable to load chat", "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="History" subtitle="Recent rewrites">
      <ScrollView contentContainerStyle={styles.content}>
        {threads.map((thread) => (
          <Pressable
            key={thread.id}
            onPress={() => openThread(thread)}
            style={styles.historyRow}
          >
            <Text style={styles.historyTitle}>{thread.title || "Untitled rewrite"}</Text>
            <Text style={styles.historyMeta}>{thread.tone || "Rewrite"}</Text>
          </Pressable>
        ))}
        {!threads.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No rewrites yet</Text>
            <Text style={styles.emptyCopy}>Your completed rewrites will appear here.</Text>
          </View>
        ) : null}
        {messages.length || loading ? (
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>{activeTitle}</Text>
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
            {messages.map((message) => (
              <View
                key={message.id}
                style={message.role === "user" ? styles.userBubble : styles.aiBubble}
              >
                <Text style={styles.bubbleText}>{message.content}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

function TemplatesScreen({
  templates,
  onUse,
}: {
  templates: RewriteTemplate[];
  onUse: (template: RewriteTemplate) => void;
}) {
  const allTemplates = useMemo(() => {
    const hasBugTemplate = templates.some((template) => template.id === bugTemplate.id);
    return hasBugTemplate ? templates : [bugTemplate, ...templates];
  }, [templates]);
  const [selected, setSelected] = useState<RewriteTemplate | null>(null);

  return (
    <Shell title="Templates" subtitle="Library">
      <ScrollView contentContainerStyle={styles.content}>
        {allTemplates.map((template) => (
          <Pressable
            key={template.id}
            onPress={() => setSelected(template)}
            style={styles.templateCard}
          >
            <Text style={styles.label}>{template.category}</Text>
            <Text style={styles.templateTitle}>{template.title}</Text>
            <Text style={styles.templateBody}>{template.body}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Modal animationType="slide" transparent visible={Boolean(selected)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSelected(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            {selected?.title || "Template: Bug Update Detail"}
          </Text>
          <Text style={styles.sheetCopy}>{selected?.body}</Text>
          <Text style={styles.templateDetailMeta}>Suggested tone: {selected?.tone}</Text>
          <Button
            title="Use template"
            onPress={() => {
              if (selected) onUse(selected);
              setSelected(null);
            }}
          />
        </View>
      </Modal>
    </Shell>
  );
}

function AccountSettings({
  session,
  usage,
  onUpgrade,
  onSignOut,
}: {
  session: AppSession;
  usage: UsageSummary | null;
  onUpgrade: () => void;
  onSignOut: () => void;
}) {
  return (
    <Shell title="Account" subtitle="Settings">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{initialFromName(session.name)}</Text>
          </View>
          <Text style={styles.profileName}>{session.name}</Text>
          <Text style={styles.profileEmail}>{session.email}</Text>
        </View>
        <View style={styles.settingsCard}>
          <Text style={styles.settingLabel}>Plan</Text>
          <Text style={styles.settingValue}>{usage?.creditBalance ? formatPlan(usage.creditBalance.plan) : formatPlan(usage?.plan)}</Text>
          <View style={styles.divider} />
          <Text style={styles.settingLabel}>{usage?.creditBalance ? "Credits" : "Daily rewrites"}</Text>
          <Text style={styles.settingValue}>
            {usage?.creditBalance
              ? `${usage.creditBalance.available} of ${usage.creditBalance.allowance} remaining`
              : `${usage?.rewriteRemaining ?? 0} remaining`}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.settingLabel}>Universal Copy</Text>
          <Text style={styles.settingValue}>One-device claim mode</Text>
        </View>
        <Button title="Upgrade" onPress={onUpgrade} />
        <Button title="Sign out" variant="secondary" onPress={onSignOut} />
      </ScrollView>
    </Shell>
  );
}

function BottomNav({
  view,
  setView,
}: {
  view: ViewName;
  setView: (view: ViewName) => void;
}) {
  const tabs: Array<{ view: ViewName; label: string }> = [
    { view: "home", label: "Write" },
    { view: "history", label: "History" },
    { view: "templates", label: "Templates" },
    { view: "settings", label: "Account" },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.view}
          onPress={() => setView(tab.view)}
          style={[styles.navItem, view === tab.view ? styles.navItemActive : null]}
        >
          <Text
            style={[styles.navText, view === tab.view ? styles.navTextActive : null]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MainApp({
  session,
  selectedTone,
  setSelectedTone,
  initialThreads,
  initialTemplates,
  initialUsage,
  deviceId,
  deviceLabel,
  onSignOut,
  planFeatureGatingEnabled,
}: {
  session: AppSession;
  selectedTone: Tone;
  setSelectedTone: (tone: Tone) => void;
  initialThreads: ThreadSummary[];
  initialTemplates: RewriteTemplate[];
  initialUsage: UsageSummary | null;
  deviceId: string;
  deviceLabel: string;
  onSignOut: () => void;
  planFeatureGatingEnabled: boolean;
}) {
  const [view, setView] = useState<ViewName>("home");
  const [threads, setThreads] = useState(initialThreads);
  const [templates] = useState(initialTemplates);
  const [usage, setUsage] = useState(initialUsage);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");
  const [templateDraft, setTemplateDraft] = useState<RewriteTemplate | null>(null);

  function openUpgrade(message?: string) {
    if (message) setLimitMessage(message);
    setUpgradeOpen(true);
  }

  async function handlePlan(plan: "plus" | "pro", interval: "monthly" | "annual") {
    setUpgradeBusy(true);
    try {
      await Linking.openURL(`${pricingUrl()}?plan=${plan}&interval=${interval}`);
    } catch {
      Alert.alert(
        "Checkout needs attention",
        "We opened pricing so you can complete payment securely.",
      );
      await Linking.openURL(`${pricingUrl()}?plan=${plan}&interval=${interval}`);
    } finally {
      setUpgradeBusy(false);
    }
  }

  function useTemplate(template: RewriteTemplate) {
    setTemplateDraft(template);
    setSelectedTone(template.tone);
    setView("home");
  }

  return (
    <View style={styles.appFrame}>
      {view === "home" ? (
        <HomeWrite
          session={session}
          selectedTone={selectedTone}
          setSelectedTone={setSelectedTone}
          usage={usage}
          setUsage={setUsage}
          threads={threads}
          setThreads={setThreads}
          setView={setView}
          deviceId={deviceId}
          deviceLabel={deviceLabel}
          onOpenUpgrade={openUpgrade}
          templateDraft={templateDraft}
          onTemplateDraftUsed={() => setTemplateDraft(null)}
          planFeatureGatingEnabled={planFeatureGatingEnabled}
        />
      ) : null}
      {view === "history" ? (
        <HistoryScreen token={session.accessToken} threads={threads} />
      ) : null}
      {view === "templates" ? (
        <TemplatesScreen templates={templates} onUse={useTemplate} />
      ) : null}
      {view === "settings" ? (
        <AccountSettings
          session={session}
          usage={usage}
          onUpgrade={() => openUpgrade()}
          onSignOut={onSignOut}
        />
      ) : null}
      <BottomNav view={view} setView={setView} />
      <UpgradeFlow
        visible={upgradeOpen}
        busy={upgradeBusy}
        onSelect={handlePlan}
        onClose={() => setUpgradeOpen(false)}
      />
      <LimitReachedModal
        visible={Boolean(limitMessage)}
        message={limitMessage}
        onUpgrade={() => {
          setLimitMessage("");
          setUpgradeOpen(true);
        }}
        onClose={() => setLimitMessage("")}
      />
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<ViewName>("splash");
  const [email, setEmail] = useState("");
  const [authLoading, setAuthLoading] = useState<"google" | "magic" | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [selectedTone, setSelectedTone] = useState<Tone>("Professional");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [templates, setTemplates] = useState<RewriteTemplate[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [planFeatureGatingEnabled, setPlanFeatureGatingEnabled] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Mobile device");
  const googleClientId =
    Platform.OS === "ios"
      ? appConfig.googleIosClientId
      : Platform.OS === "android"
        ? appConfig.googleAndroidClientId
        : appConfig.googleWebClientId;
  const hasNativeGoogleClient = Boolean(googleClientId);
  const [googleRequest, , promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: appConfig.googleAndroidClientId || undefined,
    clientId: googleClientId || "missing-native-google-client-id",
    iosClientId: appConfig.googleIosClientId || undefined,
    selectAccount: true,
    webClientId: appConfig.googleWebClientId || undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => setScreen("onboarding-value"), 1100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadDevice() {
      const [id, label] = await Promise.all([getOrCreateDeviceId(), getDeviceLabel()]);
      if (!active) return;
      setDeviceId(id);
      setDeviceLabel(label);
    }

    void loadDevice();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (active && currentSession) {
        await hydrateFromSession(currentSession);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) void hydrateFromSession(nextSession);
    });

    void restoreSession();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function handleUrl(url: string) {
      try {
        await createSessionFromUrl(url);
      } catch (error) {
        Alert.alert(
          "Sign in failed",
          error instanceof Error ? error.message : "Unable to complete sign in.",
        );
      }
    }

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  async function createSessionFromUrl(url: string) {
    const query = url.includes("?")
      ? url.slice(url.indexOf("?") + 1).split("#")[0]
      : "";
    const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    const params = new URLSearchParams(
      [query, fragment].filter(Boolean).join("&"),
    );
    const authError = params.get("error_description") ?? params.get("error");
    if (authError) throw new Error(authError);

    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }

  async function hydrateFromSession(nextSession: Session) {
    const metadata = nextSession.user.user_metadata ?? {};
    const name =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : nextSession.user.email?.split("@")[0] || "ProPhrase user";
    const nextAppSession = {
      accessToken: nextSession.access_token,
      email: nextSession.user.email ?? "",
      name,
    };
    setSession(nextAppSession);

    try {
      const workspace = await loadWorkspace(nextSession.access_token);
      setUsage(workspace.usage);
      setPlanFeatureGatingEnabled(workspace.planFeatureGatingEnabled);
      setThreads(workspace.threads ?? []);
      setTemplates(workspace.templates ?? []);
      setSession({
        ...nextAppSession,
        name: workspace.user?.name || nextAppSession.name,
        email: workspace.user?.email || nextAppSession.email,
      });
      setScreen("home");
    } catch {
      Alert.alert("Workspace unavailable", "Please check your API URL and sign in again.");
    }
  }

  async function sendMagicLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setAuthLoading("magic");
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });
    setAuthLoading(null);
    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }
    Alert.alert("Check your email", "Open the magic link on this phone to continue.");
  }

  async function signInWithGoogle() {
    if (hasNativeGoogleClient && googleRequest) {
      setAuthLoading("google");
      try {
        const result = await promptGoogleAsync();
        if (result.type !== "success") return;

        const idToken =
          result.authentication?.idToken ?? result.params.id_token ?? "";
        if (!idToken) {
          throw new Error("Google did not return an identity token.");
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) throw error;
      } catch (error) {
        Alert.alert(
          "Google sign-in failed",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setAuthLoading(null);
      }
      return;
    }

    const redirectTo = getAuthRedirectUrl();

    setAuthLoading("google");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Google sign-in could not be started.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        await createSessionFromUrl(result.url);
      }
    } catch (error) {
      Alert.alert(
        "Google sign-in failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setAuthLoading(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUsage(null);
    setThreads([]);
    setTemplates([]);
    setScreen("onboarding-value");
  }

  if (screen === "splash") {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (!session || !["home", "history", "templates", "settings"].includes(screen)) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {screen === "onboarding-tone" ? (
          <OnboardingToneChoice
            selectedTone={selectedTone}
            onSelect={setSelectedTone}
            onNext={() => setScreen("onboarding-start")}
          />
        ) : screen === "onboarding-start" ? (
          <OnboardingGetStarted
            email={email}
            setEmail={setEmail}
            authLoading={authLoading}
            onGoogle={signInWithGoogle}
            onStart={sendMagicLink}
          />
        ) : (
          <OnboardingValueProp onNext={() => setScreen("onboarding-tone")} />
        )}
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <MainApp
        session={session}
        selectedTone={selectedTone}
        setSelectedTone={setSelectedTone}
        initialThreads={threads}
        initialTemplates={templates}
        initialUsage={usage}
        deviceId={deviceId}
        deviceLabel={deviceLabel}
        onSignOut={signOut}
        planFeatureGatingEnabled={planFeatureGatingEnabled}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  appFrame: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centerScreen: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.screen,
  },
  splashGlow: {
    borderRadius: 36,
    padding: 18,
    backgroundColor: colors.surfaceWarm,
    ...shadow,
  },
  splashTitle: {
    marginTop: 22,
    fontSize: 38,
    fontWeight: "800",
    color: colors.primary,
  },
  splashSubtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.muted,
  },
  logoMark: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  logoText: {
    color: colors.accent,
    fontWeight: "900",
    lineHeight: 54,
  },
  onboarding: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
    gap: 22,
  },
  step: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 45,
  },
  heroCopy: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 26,
  },
  demoCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius,
    backgroundColor: colors.surfaceCard,
    padding: 20,
    ...shadow,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  demoText: {
    marginTop: 10,
    color: colors.text,
    fontSize: 17,
    lineHeight: 25,
  },
  demoOutput: {
    marginTop: 10,
    color: colors.text,
    fontSize: 17,
    lineHeight: 25,
  },
  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: colors.border,
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  accentButton: {
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
  },
  ghostButton: {
    backgroundColor: "transparent",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.56,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: 18,
    minHeight: 54,
    color: colors.text,
    fontSize: 16,
  },
  googleButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: 16,
  },
  googleMark: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  googleMarkText: {
    color: "#4285F4",
    fontSize: 16,
    fontWeight: "900",
  },
  googleButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
  googleButtonSpacer: {
    width: 28,
  },
  authDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  authDividerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  finePrint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  toneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tonePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tonePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tonePillText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  tonePillTextActive: {
    color: "#FFFFFF",
  },
  header: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screen,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 31,
    fontWeight: "900",
  },
  headerSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  avatar: {
    height: 42,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#FFD88E",
  },
  avatarText: {
    color: "#261900",
    fontSize: 15,
    fontWeight: "900",
  },
  content: {
    padding: spacing.screen,
    paddingBottom: 120,
    gap: 18,
  },
  toneSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
    padding: 16,
  },
  toneSelectorLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  toneSelectorValue: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  writeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius,
    backgroundColor: colors.surfaceCard,
    padding: 18,
    ...shadow,
  },
  messageInput: {
    minHeight: 150,
    marginTop: 12,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceLow,
    padding: 16,
    color: colors.text,
    fontSize: 17,
    lineHeight: 25,
  },
  outputWrap: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 19,
    fontWeight: "900",
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    borderTopRightRadius: 6,
    backgroundColor: colors.surfaceLow,
    padding: 16,
  },
  aiBubble: {
    alignSelf: "flex-start",
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    backgroundColor: colors.surfaceCard,
    padding: 16,
    ...shadow,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  resultText: {
    marginTop: 10,
    color: colors.text,
    fontSize: 18,
    lineHeight: 27,
  },
  outputActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  statusText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    padding: spacing.screen,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 99,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  sheetTitle: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: "900",
  },
  sheetCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  toneRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceCard,
    paddingVertical: 11,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipTextActive: {
    color: colors.surfaceCard,
  },
  sheetRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceCard,
    padding: 15,
  },
  sheetRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceWarm,
  },
  sheetRowTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  sheetRowMeta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    padding: spacing.screen,
  },
  alertCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: colors.surfaceCard,
    padding: 22,
    gap: 12,
    ...shadow,
  },
  alertIcon: {
    alignSelf: "flex-start",
    overflow: "hidden",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceWarm,
    color: colors.accentDark,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 24,
    fontWeight: "900",
  },
  alertTitle: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: "900",
  },
  alertCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceCard,
    padding: 18,
  },
  planCardFeatured: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceWarm,
  },
  planName: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  planPrice: {
    marginTop: 8,
    color: colors.primary,
    fontSize: 34,
    fontWeight: "900",
  },
  planMeta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 14,
  },
  historyRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
    padding: 17,
  },
  historyTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  historyMeta: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 13,
  },
  emptyCard: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceCard,
    padding: 28,
  },
  emptyTitle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyCopy: {
    marginTop: 6,
    color: colors.muted,
    textAlign: "center",
  },
  detailCard: {
    gap: 12,
    marginTop: 8,
  },
  templateCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceCard,
    padding: 18,
  },
  templateTitle: {
    marginTop: 6,
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
  },
  templateBody: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  templateDetailMeta: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
  },
  profileCard: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surfaceCard,
    padding: 24,
    ...shadow,
  },
  avatarLarge: {
    height: 72,
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    backgroundColor: "#FFD88E",
  },
  avatarLargeText: {
    color: "#261900",
    fontSize: 26,
    fontWeight: "900",
  },
  profileName: {
    marginTop: 14,
    color: colors.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  profileEmail: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 14,
  },
  settingsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceCard,
    padding: 18,
  },
  settingLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  settingValue: {
    marginTop: 6,
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
  },
  bottomNav: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 8,
    ...shadow,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 11,
  },
  navItemActive: {
    backgroundColor: colors.primary,
  },
  navText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#FFFFFF",
  },
});
