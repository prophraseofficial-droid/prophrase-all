import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
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
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  claimUniversalCopy,
  createUniversalCopy,
  loadUniversalCopy,
  loadThread,
  loadWorkspace,
  rewriteMessage,
} from "./api";
import { OutcomeScreen } from "./OutcomeScreen";
import { BillingModal } from "./BillingModal";
import {
  PreferenceSettingsPanel,
  QuickStylesOnboardingScreen,
  QuickStylesPicker,
} from "./preferences-ui";
import { appConfig } from "./config";
import { parseAuthCallback } from "./auth-callback";
import { getDeviceLabel, getOrCreateDeviceId } from "./device";
import {
  classifyRewriteError,
  planLimitNotice,
  type RewriteNotice,
} from "./rewrite-error";
import { supabase } from "./supabase";
import { colors, shadow, spacing } from "./theme";
import type {
  AppSession,
  UniversalClipboardMetadata,
  RewriteTemplate,
  ThreadMessage,
  ThreadSummary,
  Tone,
  PreferenceOptions,
  UserPreferences,
  UsageSummary,
  ViewName,
  WorkspaceProfile,
} from "./types";

WebBrowser.maybeCompleteAuthSession();

const tones: Tone[] = [
  "Professional",
  "Polite",
  "Shorter",
  "Short & Crisp",
  "Human",
  "Email",
  "Slack",
  "Teams",
  "Jira Comment",
  "WhatsApp",
  "Client-safe",
  "Manager-friendly",
  "Firmer",
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
  if (Constants.appOwnership === "expo") {
    return Linking.createURL("auth/callback");
  }
  return appConfig.authRedirectUrl;
}

function initialFromName(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

async function openExternalUrl(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error("Unsupported URL");
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open link", "Please try again from prophrase.in.");
  }
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
      accessibilityRole="button"
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
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={2}
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
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={styles.googleButtonText}
      >
        {loading ? "Connecting to Google..." : "Continue with Google"}
      </Text>
      <View style={styles.googleButtonSpacer} />
    </Pressable>
  );
}

function AppleButton({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  if (Platform.OS !== "ios") return null;

  return (
    <View pointerEvents={disabled ? "none" : "auto"} style={disabled ? styles.disabled : null}>
      <AppleAuthentication.AppleAuthenticationButton
        accessibilityLabel={loading ? "Connecting to Apple" : "Continue with Apple"}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        cornerRadius={14}
        onPress={onPress}
        style={styles.appleButton}
      />
    </View>
  );
}

function AppLogo({ size = 44 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="ProPhrase"
      resizeMode="contain"
      source={require("../assets/prophrase-logo-transparent.png")}
      style={{ height: size, width: size }}
    />
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
        <AppLogo size={38} />
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

function PlanHeaderActions({
  paid,
  onOpenPlans,
  onOpenAccount,
  initial,
}: {
  paid: boolean;
  onOpenPlans: () => void;
  onOpenAccount: () => void;
  initial: string;
}) {
  return (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityLabel={paid ? "Open plan and billing" : "Upgrade plan"}
        accessibilityRole="button"
        onPress={onOpenPlans}
        style={({ pressed }) => [styles.upgradePill, pressed ? styles.pressed : null]}
      >
        <Text numberOfLines={1} style={styles.upgradePillText}>{paid ? "Plan" : "Upgrade"}</Text>
      </Pressable>
      <Pressable accessibilityLabel="Open account" accessibilityRole="button" style={styles.avatar} onPress={onOpenAccount}>
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
    </View>
  );
}

function ExpandableCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.expandableCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.expandableHeader}
      >
        <View style={styles.expandableTitleWrap}>
          <Text style={styles.expandableTitle}>{title}</Text>
          <Text numberOfLines={2} style={styles.expandableSummary}>{summary}</Text>
        </View>
        <Text style={styles.expandableChevron}>{open ? "−" : "+"}</Text>
      </Pressable>
      {open ? <View style={styles.expandableBody}>{children}</View> : null}
    </View>
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

function WorkspaceErrorScreen({
  message,
  busy,
  onRetry,
  onSignOut,
}: {
  message: string;
  busy: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <SafeAreaView style={[styles.safe, styles.centerScreen]}>
      <View style={styles.errorStateCard}>
        <Text style={styles.alertIcon}>!</Text>
        <Text style={styles.alertTitle}>Workspace unavailable</Text>
        <Text style={styles.alertCopy}>{message}</Text>
        <Button disabled={busy} title={busy ? "Connecting..." : "Try again"} onPress={onRetry} />
        <Button disabled={busy} title="Sign out" variant="secondary" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  );
}

function OnboardingValueProp({ onNext }: { onNext: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.onboarding}
        showsVerticalScrollIndicator={false}
      >
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
        <View style={styles.demoCard}>
          <Text style={styles.label}>MORE THAN REWRITING</Text>
          <Text style={styles.demoOutput}>
            Outcome Assistant prepares safer, balanced, and firmer messages for
            the result you need.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.demoOutput}>
            Universal Copy moves polished text between trusted devices, while
            history, templates, and preferences stay with your account.
          </Text>
        </View>
        <Button title="Continue" onPress={onNext} />
      </ScrollView>
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
      <ScrollView
        contentContainerStyle={styles.onboarding}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>
    </SafeAreaView>
  );
}

function OnboardingGetStarted({
  email,
  setEmail,
  password,
  setPassword,
  authLoading,
  onApple,
  onGoogle,
  onPassword,
  onStart,
}: {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  authLoading: "apple" | "google" | "magic" | "password" | null;
  onApple: () => void;
  onGoogle: () => void;
  onPassword: () => void;
  onStart: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.onboarding}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.step}>Step 3 of 3</Text>
          <Text style={styles.heroTitle}>Start rewriting from your phone.</Text>
          <Text style={styles.heroCopy}>
            Sign in once to use rewriting, Outcome Assistant, Universal Copy,
            history, templates, preferences, and usage across your devices.
          </Text>
          <AppleButton
            disabled={authLoading !== null}
            loading={authLoading === "apple"}
            onPress={onApple}
          />
          <GoogleButton
            disabled={authLoading !== null}
            loading={authLoading === "google"}
            onPress={onGoogle}
          />
          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text numberOfLines={1} style={styles.authDividerText}>or continue with email</Text>
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
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Password for an existing account"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Button
            disabled={authLoading !== null || !email.trim() || password.length < 6}
            title={authLoading === "password" ? "Signing in..." : "Sign in with email and password"}
            onPress={onPassword}
          />
          <Button
            disabled={authLoading !== null || !email.trim()}
            title={authLoading === "magic" ? "Sending magic link..." : "Send magic link"}
            onPress={onStart}
            variant="secondary"
          />
          <Text style={styles.finePrint}>
            Mobile uses Supabase secure sessions. Your API keys stay on the server.
          </Text>
          <View style={styles.legalRow}>
            <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(appConfig.privacyPolicyUrl)}>
              <Text style={styles.legalLink}>Privacy</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(appConfig.termsUrl)}>
              <Text style={styles.legalLink}>Terms</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RewriteNoticeModal({
  notice,
  onClose,
}: {
  notice: RewriteNotice | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!notice) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={[styles.modalCenter, { paddingBottom: Math.max(insets.bottom, spacing.screen) }]}>
        <View style={styles.alertCard}>
          <Text style={styles.alertIcon}>!</Text>
          <Text style={styles.alertTitle}>{notice.title}</Text>
          <Text style={styles.alertCopy}>{notice.message}</Text>
          <Text style={styles.alertHint}>{notice.hint}</Text>
          <Button title="Got it" onPress={onClose} />
        </View>
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
  onPlanLimit,
  onRewriteError,
  onOpenPlans,
  templateDraft,
  onTemplateDraftUsed,
  planFeatureGatingEnabled,
  preferences,
  preferenceOptions,
  onPreferencesChange,
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
  onPlanLimit: (message?: string) => void;
  onRewriteError: (error: unknown) => void;
  onOpenPlans: () => void;
  templateDraft: RewriteTemplate | null;
  onTemplateDraftUsed: () => void;
  planFeatureGatingEnabled: boolean;
  preferences: UserPreferences;
  preferenceOptions: PreferenceOptions;
  onPreferencesChange: (preferences: UserPreferences) => void;
}) {
  const [text, setText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [result, setResult] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [universalItem, setUniversalItem] = useState<UniversalClipboardMetadata | null>(null);
  const [universalBusy, setUniversalBusy] = useState(false);

  useEffect(() => {
    if (!templateDraft) return;
    setText(templateDraft.body);
    setSelectedTone(templateDraft.tone);
    setSourceText("");
    setResult("");
    setThreadId(null);
    onTemplateDraftUsed();
  }, [onTemplateDraftUsed, setSelectedTone, templateDraft]);

  useEffect(() => {
    if (!deviceId) return;
    let active = true;

    async function refreshUniversalItem() {
      try {
        const data = await loadUniversalCopy({
          token: session.accessToken,
          deviceId,
        });
        if (active) setUniversalItem(data.item);
      } catch {
        // Polling is best-effort and should never interrupt rewriting.
      }
    }

    void refreshUniversalItem();
    const timer = setInterval(() => void refreshUniversalItem(), 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId, session.accessToken]);

  async function handleRewrite() {
    const trimmed = text.trim();
    if (loading) return;
    if (trimmed.length < 3) {
      setStatus("Enter at least 3 characters.");
      return;
    }
    if (trimmed.length > 5000) {
      setStatus("Your message is over 5,000 characters. Shorten it before rewriting.");
      return;
    }
    if (
      planFeatureGatingEnabled &&
      !["plus", "pro", "pro_monthly", "pro_yearly"].includes(usage?.creditBalance?.plan ?? usage?.plan ?? "free") &&
      !["Professional", "Polite", "Shorter"].includes(selectedTone)
    ) {
      onPlanLimit(`${selectedTone} is available on Plus and Pro.`);
      return;
    }
    if (usage?.creditBalance && usage.creditBalance.available <= 0) {
      onPlanLimit("You have no credits remaining for this credit period.");
      return;
    }
    if (usage && !usage.creditBalance && !usage.isPro && usage.rewriteRemaining <= 0) {
      onPlanLimit("You have used your free rewrites for today.");
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
      onRewriteError(error);
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
      const data = await createUniversalCopy({
        token: session.accessToken,
        deviceId,
        deviceLabel,
        text: result,
      });
      setUniversalItem(data.item);
      await Clipboard.setStringAsync(result);
      setStatus("Universal copy ready for one trusted device.");
    } catch {
      setStatus("Universal copy could not be created.");
    } finally {
      setLoading(false);
    }
  }

  async function universalPaste() {
    if (!universalItem || universalBusy) return;
    setUniversalBusy(true);
    setStatus("");
    try {
      const data = await claimUniversalCopy({
        token: session.accessToken,
        deviceId,
        deviceLabel,
        clipId: universalItem.id,
      });
      await Clipboard.setStringAsync(data.text);
      setText(data.text);
      setUniversalItem(data.item);
      setStatus("Universal copy pasted into the composer and copied locally.");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Universal copy could not be claimed.");
      try {
        const latest = await loadUniversalCopy({ token: session.accessToken, deviceId });
        setUniversalItem(latest.item);
      } catch {
        // Keep the original failure message.
      }
    } finally {
      setUniversalBusy(false);
    }
  }

  const universalAvailable = Boolean(
    universalItem &&
    universalItem.status === "available" &&
    !universalItem.isExpired &&
    new Date(universalItem.expiresAt).getTime() > Date.now(),
  );
  const canClaimUniversal = universalAvailable && universalItem?.sourceDeviceId !== deviceId;

  return (
    <Shell
      title="Write"
      subtitle={usage?.creditBalance ? `${usage.creditBalance.available} credits left` : usage?.isPro ? "Paid workspace" : `${usage?.rewriteRemaining ?? 0} rewrites left`}
      right={
        <PlanHeaderActions
          initial={initialFromName(session.name)}
          onOpenAccount={() => setView("settings")}
          onOpenPlans={onOpenPlans}
          paid={(usage?.creditBalance?.plan ?? usage?.plan ?? "free") !== "free"}
        />
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
          <QuickStylesPicker
            onSelect={setSelectedTone}
            onUpdate={onPreferencesChange}
            options={preferenceOptions}
            preferences={preferences}
            selectedTone={selectedTone}
            token={session.accessToken}
          />

          {universalAvailable ? (
            <View style={styles.universalCard}>
              <View style={styles.universalCopyWrap}>
                <Text style={styles.universalEyebrow}>UNIVERSAL COPY</Text>
                <Text numberOfLines={2} style={styles.universalPreview}>
                  {universalItem?.preview}
                </Text>
                <Text style={styles.universalMeta}>
                  {canClaimUniversal
                    ? `Ready from ${universalItem?.sourceDeviceLabel}`
                    : "Ready for one of your other trusted devices"}
                </Text>
              </View>
              {canClaimUniversal ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={universalBusy}
                  onPress={() => void universalPaste()}
                  style={[styles.universalPasteButton, universalBusy && styles.disabled]}
                >
                  <Text style={styles.universalPasteText}>{universalBusy ? "Pasting..." : "Paste"}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.writeCard}>
            <Text style={styles.label}>ROUGH MESSAGE</Text>
            <TextInput
              maxLength={5000}
              multiline
              onChangeText={setText}
              placeholder="Type what you want to say..."
              placeholderTextColor={colors.muted}
              style={styles.messageInput}
              textAlignVertical="top"
              value={text}
            />
            <Button
              disabled={loading || text.trim().length < 3}
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
                    <View style={styles.outputAction}>
                      <Button title="Copy" variant="secondary" onPress={copyResult} />
                    </View>
                    <View style={styles.outputAction}>
                      <Button
                        title="Copy Universal"
                        variant="accent"
                        disabled={loading}
                        onPress={universalCopy}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  const [detailOpen, setDetailOpen] = useState(false);
  const insets = useSafeAreaInsets();

  async function openThread(thread: ThreadSummary) {
    setLoading(true);
    setMessages([]);
    setActiveTitle(thread.title || "Rewrite");
    setDetailOpen(true);
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
      <FlatList
        contentContainerStyle={styles.content}
        data={threads}
        keyExtractor={(thread) => thread.id}
        renderItem={({ item: thread }) => (
          <Pressable
            onPress={() => openThread(thread)}
            style={styles.historyRow}
          >
            <Text style={styles.historyTitle}>{thread.title || "Untitled rewrite"}</Text>
            <Text style={styles.historyMeta}>
              {[thread.tone || "Rewrite", thread.updated_at ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(thread.updated_at)) : null].filter(Boolean).join(" · ")}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No rewrites yet</Text>
            <Text style={styles.emptyCopy}>Your completed rewrites will appear here.</Text>
          </View>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      />
      <Modal animationType="slide" onRequestClose={() => setDetailOpen(false)} transparent visible={detailOpen}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDetailOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.screen) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeadingRow}>
            <Text numberOfLines={2} style={styles.sheetTitle}>{activeTitle}</Text>
            <Pressable accessibilityLabel="Close history" accessibilityRole="button" onPress={() => setDetailOpen(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            contentContainerStyle={styles.historyDetailList}
            data={messages}
            keyExtractor={(message) => message.id}
            ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} size="large" /> : null}
            renderItem={({ item: message }) => (
              <View key={message.id} style={message.role === "user" ? styles.userBubble : styles.aiBubble}>
                <Text style={styles.bubbleText}>{message.content}</Text>
                {message.role === "assistant" ? (
                  <Pressable accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(message.content)} style={styles.inlineCopyButton}>
                    <Text style={styles.inlineCopyText}>Copy</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
            showsVerticalScrollIndicator={false}
            style={styles.flex}
          />
        </View>
      </Modal>
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RewriteTemplate | null>(null);
  const insets = useSafeAreaInsets();
  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allTemplates;
    return allTemplates.filter((template) =>
      [template.title, template.category, template.tone, template.body]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [allTemplates, search]);

  return (
    <Shell title="Templates" subtitle="Library">
      <FlatList
        contentContainerStyle={styles.content}
        data={visibleTemplates}
        keyExtractor={(template) => template.id}
        ListHeaderComponent={(
          <TextInput
            accessibilityLabel="Search templates"
            autoCapitalize="none"
            onChangeText={setSearch}
            placeholder="Search templates"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={search}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matching templates</Text>
            <Text style={styles.emptyCopy}>Try a title, category, or tone.</Text>
          </View>
        )}
        renderItem={({ item: template }) => (
          <Pressable
            onPress={() => setSelected(template)}
            style={styles.templateCard}
          >
            <Text style={styles.label}>{template.category}</Text>
            <Text style={styles.templateTitle}>{template.title}</Text>
            <Text style={styles.templateBody}>{template.body}</Text>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        transparent
        visible={Boolean(selected)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSelected(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.screen) }]}>
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
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
          </ScrollView>
        </View>
      </Modal>
    </Shell>
  );
}

function AccountSettings({
  session,
  usage,
  profile,
  onSignOut,
  onRefresh,
  refreshing,
  preferences,
  preferenceOptions,
  onPreferencesChange,
  onOpenPlans,
}: {
  session: AppSession;
  usage: UsageSummary | null;
  profile: WorkspaceProfile | null;
  onSignOut: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  preferences: UserPreferences;
  preferenceOptions: PreferenceOptions;
  onPreferencesChange: (preferences: UserPreferences) => void;
  onOpenPlans: () => void;
}) {
  const periodEnd = profile?.currentPeriodEnd
    ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(profile.currentPeriodEnd))
    : null;
  const planName = usage?.creditBalance
    ? formatPlan(usage.creditBalance.plan)
    : formatPlan(usage?.plan);
  const usageSummary = usage?.creditBalance
    ? `${usage.creditBalance.available} of ${usage.creditBalance.allowance} credits remaining`
    : `${usage?.rewriteRemaining ?? 0} daily rewrites remaining`;

  function requestDeletion() {
    Alert.alert(
      "Request account deletion?",
      "This starts a deletion request for your ProPhrase account and associated data. Some billing or fraud-prevention records may be retained where legally required.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            const subject = encodeURIComponent("ProPhrase account deletion request");
            const body = encodeURIComponent(`Please delete my ProPhrase account and associated data.\n\nAccount email: ${session.email}\nUser ID: ${session.userId}`);
            void openExternalUrl(`mailto:${appConfig.privacyEmail}?subject=${subject}&body=${body}`);
          },
        },
      ],
    );
  }

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
        <Button
          title={planName === "Free" ? "Upgrade to Plus or Pro" : "Manage plan and billing"}
          variant="accent"
          onPress={onOpenPlans}
        />
        <ExpandableCard title="Plan and usage" summary={`${planName} · ${usageSummary}`}>
          <Text style={styles.settingLabel}>Plan</Text>
          <Text style={styles.settingValue}>{planName}</Text>
          {profile?.subscriptionStatus ? <Text style={styles.settingMeta}>Status: {profile.subscriptionStatus.replaceAll("_", " ")}</Text> : null}
          {periodEnd ? <Text style={styles.settingMeta}>Current period ends {periodEnd}</Text> : null}
          <View style={styles.divider} />
          <Text style={styles.settingLabel}>{usage?.creditBalance ? "Credits" : "Daily rewrites"}</Text>
          <Text style={styles.settingValue}>
            {usage?.creditBalance
              ? `${usage.creditBalance.available} of ${usage.creditBalance.allowance} remaining`
              : `${usage?.rewriteRemaining ?? 0} remaining`}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.settingLabel}>Universal Copy</Text>
          <Text style={styles.settingValue}>One trusted-device claim</Text>
          <Text style={styles.settingMeta}>Available copies expire after five minutes.</Text>
          <View style={styles.divider} />
          <Button
            title={planName === "Free" ? "View upgrade plans" : "Manage billing"}
            variant="accent"
            onPress={onOpenPlans}
          />
        </ExpandableCard>
        <ExpandableCard
          title="Writing preferences"
          summary="Quick Styles, Outcome favorites and defaults"
        >
          <PreferenceSettingsPanel
            onUpdate={onPreferencesChange}
            options={preferenceOptions}
            preferences={preferences}
            token={session.accessToken}
          />
        </ExpandableCard>
        <ExpandableCard
          title="Account and support"
          summary="Refresh account, legal information, help and deletion"
        >
          <Button disabled={refreshing} title={refreshing ? "Refreshing account..." : "Refresh plan and credits"} variant="secondary" onPress={onRefresh} />
          <Button title="Privacy Policy" variant="secondary" onPress={() => void openExternalUrl(appConfig.privacyPolicyUrl)} />
          <Button title="Terms of Service" variant="secondary" onPress={() => void openExternalUrl(appConfig.termsUrl)} />
          <Button title="Help and support" variant="secondary" onPress={() => void openExternalUrl(`mailto:${appConfig.supportEmail}?subject=${encodeURIComponent("ProPhrase mobile support")}`)} />
          <Button title="Request account deletion" variant="ghost" onPress={requestDeletion} />
        </ExpandableCard>
        <Button title="Sign out" variant="secondary" onPress={onSignOut} />
        <Text style={styles.versionText}>ProPhrase {Constants.expoConfig?.version ?? "1.0.0"}</Text>
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
  const insets = useSafeAreaInsets();
  const tabs: Array<{ view: ViewName; label: string; accessibilityLabel?: string }> = [
    { view: "home", label: "Rephrase" },
    { view: "outcome", label: "Outcome" },
    { view: "history", label: "History" },
    { view: "templates", label: "Library", accessibilityLabel: "Templates" },
    { view: "settings", label: "Account" },
  ];

  return (
    <View style={[styles.bottomNav, { bottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityLabel={tab.accessibilityLabel ?? tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === tab.view }}
          key={tab.view}
          onPress={() => setView(tab.view)}
          style={[styles.navItem, view === tab.view ? styles.navItemActive : null]}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
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
  initialProfile,
  deviceId,
  deviceLabel,
  onSignOut,
  planFeatureGatingEnabled,
  initialPreferences,
  preferenceOptions,
}: {
  session: AppSession;
  selectedTone: Tone;
  setSelectedTone: (tone: Tone) => void;
  initialThreads: ThreadSummary[];
  initialTemplates: RewriteTemplate[];
  initialUsage: UsageSummary | null;
  initialProfile: WorkspaceProfile | null;
  deviceId: string;
  deviceLabel: string;
  onSignOut: () => void;
  planFeatureGatingEnabled: boolean;
  initialPreferences: UserPreferences;
  preferenceOptions: PreferenceOptions;
}) {
  const [view, setView] = useState<ViewName>("home");
  const [threads, setThreads] = useState(initialThreads);
  const [templates] = useState(initialTemplates);
  const [usage, setUsage] = useState(initialUsage);
  const [profile, setProfile] = useState(initialProfile);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const [rewriteNotice, setRewriteNotice] = useState<RewriteNotice | null>(null);
  const [templateDraft, setTemplateDraft] = useState<RewriteTemplate | null>(null);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [billingVisible, setBillingVisible] = useState(false);

  function showPlanLimit(message?: string) {
    setRewriteNotice(planLimitNotice(message || "Your current plan does not include this action."));
  }

  async function refreshWorkspace(showConfirmation = false) {
    setRefreshingAccount(true);
    try {
      const workspace = await loadWorkspace(session.accessToken);
      setUsage(workspace.usage);
      setProfile(workspace.profile);
      setThreads(workspace.threads ?? []);
      setPreferences(workspace.preferences.preferences);
      if (showConfirmation) Alert.alert("Account refreshed", "Your plan, credits, history, and preferences are up to date.");
    } catch (caught) {
      if (showConfirmation) {
        Alert.alert("Refresh failed", caught instanceof Error ? caught.message : "Please try again.");
      }
    } finally {
      setRefreshingAccount(false);
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshWorkspace(false);
    });
    return () => subscription.remove();
  }, [session.accessToken]);

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
          onPlanLimit={showPlanLimit}
          onRewriteError={(error) => setRewriteNotice(classifyRewriteError(error))}
          onOpenPlans={() => setBillingVisible(true)}
          templateDraft={templateDraft}
          onTemplateDraftUsed={() => setTemplateDraft(null)}
          planFeatureGatingEnabled={planFeatureGatingEnabled}
          preferences={preferences}
          preferenceOptions={preferenceOptions}
          onPreferencesChange={setPreferences}
        />
      ) : null}
      {view === "outcome" ? (
        <OutcomeScreen
          deviceId={deviceId}
          deviceLabel={deviceLabel}
          options={preferenceOptions}
          preferences={preferences}
          session={session}
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
          profile={profile}
          onSignOut={onSignOut}
          onRefresh={() => void refreshWorkspace(true)}
          refreshing={refreshingAccount}
          preferences={preferences}
          preferenceOptions={preferenceOptions}
          onPreferencesChange={setPreferences}
          onOpenPlans={() => setBillingVisible(true)}
        />
      ) : null}
      <BottomNav view={view} setView={setView} />
      <RewriteNoticeModal
        notice={rewriteNotice}
        onClose={() => setRewriteNotice(null)}
      />
      <BillingModal
        currentPlan={usage?.creditBalance?.plan ?? usage?.plan ?? profile?.plan ?? "free"}
        enabled={appConfig.razorpayCheckoutEnabled}
        onClose={() => setBillingVisible(false)}
        onCompleted={() => refreshWorkspace(false)}
        token={session.accessToken}
        user={{ email: session.email, name: session.name }}
        visible={billingVisible}
      />
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<ViewName>("splash");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"apple" | "google" | "magic" | "password" | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [selectedTone, setSelectedTone] = useState<Tone>("Professional");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [templates, setTemplates] = useState<RewriteTemplate[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [planFeatureGatingEnabled, setPlanFeatureGatingEnabled] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [preferenceOptions, setPreferenceOptions] = useState<PreferenceOptions | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Mobile device");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const authEpochRef = useRef(0);
  const processedAuthCallbacksRef = useRef(new Set<string>());
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
    const timer = setTimeout(() => setSplashElapsed(true), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (sessionRestored && splashElapsed && screen === "splash" && !session) {
      setScreen("onboarding-value");
    }
  }, [screen, session, sessionRestored, splashElapsed]);

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
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (active && currentSession) {
          await hydrateFromSession(currentSession);
        }
      } finally {
        if (active) setSessionRestored(true);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        void hydrateFromSession(nextSession);
      } else if (event === "SIGNED_OUT") {
        authEpochRef.current += 1;
        clearAuthenticatedState();
      }
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
    const callback = parseAuthCallback(url, getAuthRedirectUrl());
    if (!callback) return false;

    if (processedAuthCallbacksRef.current.has(callback.code)) return true;
    processedAuthCallbacksRef.current.add(callback.code);

    const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
    if (error) {
      processedAuthCallbacksRef.current.delete(callback.code);
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (currentSession) return true;
      throw error;
    }
    setTimeout(() => processedAuthCallbacksRef.current.delete(callback.code), 60_000);
    return true;
  }

  async function hydrateFromSession(nextSession: Session) {
    const authEpoch = ++authEpochRef.current;
    setWorkspaceBusy(true);
    setWorkspaceError("");
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
      userId: nextSession.user.id,
    };
    setSession(nextAppSession);

    try {
      const workspace = await loadWorkspace(nextSession.access_token);
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (
        authEpochRef.current !== authEpoch ||
        currentSession?.user.id !== nextSession.user.id
      ) {
        return;
      }
      setUsage(workspace.usage);
      setProfile(workspace.profile);
      setPlanFeatureGatingEnabled(workspace.planFeatureGatingEnabled);
      setThreads(workspace.threads ?? []);
      setTemplates(workspace.templates ?? []);
      setPreferences(workspace.preferences.preferences);
      setPreferenceOptions(workspace.preferenceOptions);
      const defaultTone = workspace.preferenceOptions.quickStyles.find(
        (style) => style.id === workspace.preferences.preferences.rephrase.defaultStyle,
      )?.tone;
      if (defaultTone) setSelectedTone(defaultTone);
      setSession({
        ...nextAppSession,
        name: workspace.user?.name || nextAppSession.name,
        email: workspace.user?.email || nextAppSession.email,
      });
      setScreen(workspace.preferences.onboardingRequired ? "quick-styles" : "home");
    } catch (caught) {
      if (authEpochRef.current === authEpoch) {
        setWorkspaceError(caught instanceof Error ? caught.message : "Please check your connection and try again.");
      }
    } finally {
      if (authEpochRef.current === authEpoch) setWorkspaceBusy(false);
    }
  }

  async function retryWorkspace() {
    const { data } = await supabase.auth.getSession();
    if (data.session) await hydrateFromSession(data.session);
    else await signOut();
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

  async function signInWithPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) return;
    setAuthLoading("password");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch (caught) {
      Alert.alert("Sign in failed", caught instanceof Error ? caught.message : "Please check your credentials.");
    } finally {
      setAuthLoading(null);
    }
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
        const handled = await createSessionFromUrl(result.url);
        if (!handled) throw new Error("Google returned an unexpected callback URL.");
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

  async function signInWithApple() {
    if (Platform.OS !== "ios") return;
    setAuthLoading("apple");
    try {
      if (!(await AppleAuthentication.isAvailableAsync())) {
        throw new Error("Sign in with Apple is not available on this device.");
      }

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;

      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ");
      if (fullName) {
        await supabase.auth.updateUser({ data: { full_name: fullName } });
      }
    } catch (caught) {
      const errorCode = (caught as { code?: string }).code;
      if (errorCode !== "ERR_REQUEST_CANCELED") {
        Alert.alert(
          "Apple sign-in failed",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    } finally {
      setAuthLoading(null);
    }
  }

  function clearAuthenticatedState() {
    setSession(null);
    setUsage(null);
    setProfile(null);
    setThreads([]);
    setTemplates([]);
    setPreferences(null);
    setPreferenceOptions(null);
    setWorkspaceError("");
    setScreen("onboarding-value");
  }

  async function signOut() {
    authEpochRef.current += 1;
    clearAuthenticatedState();

    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) await supabase.auth.signOut({ scope: "local" });
  }

  if (workspaceError && session) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <WorkspaceErrorScreen
          busy={workspaceBusy}
          message={workspaceError}
          onRetry={() => void retryWorkspace()}
          onSignOut={() => void signOut()}
        />
      </SafeAreaProvider>
    );
  }

  if (screen === "splash") {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (screen === "quick-styles" && session && preferences && preferenceOptions) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <QuickStylesOnboardingScreen
          onComplete={(nextPreferences) => {
            setPreferences(nextPreferences);
            const tone = preferenceOptions.quickStyles.find((style) => style.id === nextPreferences.rephrase.defaultStyle)?.tone;
            if (tone) setSelectedTone(tone);
            setScreen("home");
          }}
          options={preferenceOptions}
          preferences={preferences}
          token={session.accessToken}
        />
      </SafeAreaProvider>
    );
  }

  if (!session || !["home", "outcome", "history", "templates", "settings"].includes(screen)) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {screen === "onboarding-start" ? (
          <OnboardingGetStarted
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            authLoading={authLoading}
            onApple={signInWithApple}
            onGoogle={signInWithGoogle}
            onPassword={signInWithPassword}
            onStart={sendMagicLink}
          />
        ) : (
          <OnboardingValueProp onNext={() => setScreen("onboarding-start")} />
        )}
      </SafeAreaProvider>
    );
  }

  if (!preferences || !preferenceOptions) return null;

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
        initialProfile={profile}
        deviceId={deviceId}
        deviceLabel={deviceLabel}
        onSignOut={signOut}
        planFeatureGatingEnabled={planFeatureGatingEnabled}
        initialPreferences={preferences}
        preferenceOptions={preferenceOptions}
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
  onboarding: {
    alignSelf: "center",
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 680,
    padding: spacing.screen,
    gap: 22,
    width: "100%",
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
    fontSize: 38,
    fontWeight: "900",
    lineHeight: 42,
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
    textAlign: "center",
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
  appleButton: {
    height: 54,
    width: "100%",
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
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    marginHorizontal: 10,
    textAlign: "center",
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
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
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
    gap: 12,
    paddingHorizontal: spacing.screen,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  upgradePill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 13,
  },
  upgradePillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 31,
    flexShrink: 1,
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
    alignSelf: "center",
    maxWidth: 720,
    padding: spacing.screen,
    paddingBottom: 120,
    gap: 18,
    width: "100%",
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
    flexWrap: "wrap",
    gap: 10,
  },
  outputAction: {
    flexGrow: 1,
    flexBasis: 132,
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
    maxHeight: "88%",
    padding: spacing.screen,
  },
  sheetList: {
    gap: 12,
    paddingBottom: 2,
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
    justifyContent: "center",
    minHeight: 44,
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
    maxHeight: "90%",
    maxWidth: 560,
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
  alertHint: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  errorStateCard: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    maxWidth: 520,
    padding: 22,
    width: "100%",
    ...shadow,
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
  sheetHeadingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceLow,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  historyDetailList: {
    gap: 12,
    paddingBottom: 12,
    paddingTop: 16,
  },
  inlineCopyButton: {
    alignSelf: "flex-start",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  inlineCopyText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
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
    textAlign: "center",
  },
  profileEmail: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
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
  settingMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    textTransform: "capitalize",
  },
  expandableCard: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  expandableHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  expandableTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  expandableTitle: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "900",
  },
  expandableSummary: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  expandableChevron: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: "500",
    textAlign: "center",
    width: 30,
  },
  expandableBody: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    padding: 18,
  },
  accountSection: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  accountSectionTitle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },
  versionText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },
  legalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  legalLink: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  legalDot: {
    color: colors.muted,
    fontSize: 12,
  },
  universalCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.accent,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15,
  },
  universalCopyWrap: {
    flex: 1,
    minWidth: 0,
  },
  universalEyebrow: {
    color: colors.accentDark,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  universalPreview: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 4,
  },
  universalMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  universalPasteButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  universalPasteText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  bottomNav: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    gap: 4,
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
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 2,
  },
  navItemActive: {
    backgroundColor: colors.primary,
  },
  navText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  navTextActive: {
    color: "#FFFFFF",
  },
});
