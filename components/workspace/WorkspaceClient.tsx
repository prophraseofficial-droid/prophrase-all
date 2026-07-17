"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuickStylesBar } from "@/components/preferences/QuickStylesBar";
import { isOutcomeAssistantClientEnabled } from "@/lib/feature-flags";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RewriteTemplate } from "@/lib/templates";
import type { Tone } from "@/lib/tones";
import { isTone, tones } from "@/lib/tones";
import { patchPreferences } from "@/lib/preferences/client";
import {
  quickStyleById,
  recommendedPreferences,
  type UserPreferences,
} from "@/lib/preferences/registry";
import { isPreferencesEnabled } from "@/lib/preferences/flags";
import { estimateCreditCost } from "@/lib/billing/credits";
import type { CreditBalance } from "@/lib/billing/types";

const OutcomeAssistantPanel = dynamic(
  () => import("@/components/outcome-assistant/OutcomeAssistantPanel")
    .then((module) => module.OutcomeAssistantPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center px-6 py-20 text-sm text-text-muted">
        Loading Outcome Assistant…
      </div>
    ),
  },
);

const QuickStylesOnboarding = dynamic(
  () => import("@/components/preferences/QuickStylesOnboarding")
    .then((module) => module.QuickStylesOnboarding),
  { ssr: false },
);

type UsageSummary = {
  plan: "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
  isPro: boolean;
  rewriteCount: number;
  rewriteLimit: number;
  threadCount: number;
  threadLimit: number;
  rewriteRemaining: number;
  threadRemaining: number;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
  upgrade?: {
    monthly: string;
    yearly: string;
  };
  usage?: UsageSummary;
  requiredCredits?: number;
  availableCredits?: number;
  nextRefreshAt?: string | null;
  currentPlan?: string;
  requiredPlan?: string;
};

type UniversalClipboardMetadata = {
  id: string;
  sourceDeviceId: string;
  sourceDeviceLabel: string;
  preview: string;
  status: "available" | "claimed" | "expired";
  claimedByDeviceId: string | null;
  claimedByDeviceLabel: string | null;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
};

type RewriteOptions = {
  text?: string;
  tone?: Tone;
  displayInput?: string;
  instruction?: string;
  clearComposer?: boolean;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResult = ArrayLike<SpeechRecognitionAlternative> & {
  isFinal: boolean;
};

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResult>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onnomatch?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type WorkspaceView = "rewrite" | "history" | "templates";
type WorkspaceMode = "rephrase" | "outcome";
type VoiceStatus = "idle" | "starting" | "listening" | "processing";

type ThreadSummary = {
  id: string;
  title: string;
  tone?: Tone | null;
  is_favorite?: boolean | null;
  updated_at?: string | null;
};

type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: Tone | null;
  created_at?: string | null;
};

const sidebarItems: Array<{
  icon: IconName;
  label: string;
  view: WorkspaceView;
}> = [
  { icon: "edit", label: "Rewrite", view: "rewrite" },
  { icon: "history", label: "History", view: "history" },
  { icon: "templates", label: "Templates", view: "templates" },
];

const deviceIdStorageKey = "prophrase.device.id";
const universalClipboardRefreshMs = 30_000;
const universalClipboardTtlSeconds = 5 * 60;
const rewriteRequestTimeoutMs = 50_000;
const outcomeAssistantEnabled = isOutcomeAssistantClientEnabled();
const preferencesFeatureEnabled = isPreferencesEnabled();
const workspacePreferenceDefaults = recommendedPreferences();
workspacePreferenceDefaults.onboardingCompleted = true;
workspacePreferenceDefaults.existingNoticeDismissed = true;

type IconName =
  | "search"
  | "edit"
  | "history"
  | "templates"
  | "spark"
  | "copy"
  | "refresh"
  | "thumb-up"
  | "thumb-down"
  | "magic"
  | "bolt"
  | "mic"
  | "user"
  | "log-out";

const iconPaths: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h16" />
      <path d="m14 4 6 6-9.5 9.5H4.5v-6Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  templates: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
      <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 0 1-14.9 4" />
      <path d="M4 12A8 8 0 0 1 18.9 8" />
      <path d="M18 3v5h-5" />
      <path d="M6 21v-5h5" />
    </>
  ),
  "thumb-up": (
    <>
      <path d="M7 22V10" />
      <path d="M15 8V4a3 3 0 0 0-3-3l-4 9v12h11a2 2 0 0 0 2-1.7l1-7A2 2 0 0 0 20 11h-5Z" />
      <path d="M3 10h4v12H3z" />
    </>
  ),
  "thumb-down": (
    <>
      <path d="M17 2v12" />
      <path d="M9 16v4a3 3 0 0 0 3 3l4-9V2H5a2 2 0 0 0-2 1.7l-1 7A2 2 0 0 0 4 13h5Z" />
      <path d="M17 2h4v12h-4z" />
    </>
  ),
  magic: (
    <>
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="m17.8 6.2 1.4-1.4" />
      <path d="m10.8 13.2-1.4 1.4" />
      <path d="m17.8 11.8 1.4 1.4" />
      <path d="M15 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      <path d="m3 21 9-9" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
    </>
  ),
  user: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  "log-out": (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-[1em] w-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {iconPaths[name]}
    </svg>
  );
}

function getOrCreateDeviceId() {
  const existing = window.localStorage.getItem(deviceIdStorageKey);
  if (existing) return existing;

  const nextId =
    typeof crypto.randomUUID === "function"
      ? `web:${crypto.randomUUID()}`
      : `web:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(deviceIdStorageKey, nextId);
  return nextId;
}

function getBrowserDeviceLabel() {
  const desktop = (window as Window & {
    prophraseDesktop?: { isDesktop: boolean; platform: string };
  }).prophraseDesktop;
  if (desktop?.isDesktop) {
    if (desktop.platform === "darwin") return "ProPhrase for Mac";
    if (desktop.platform === "win32") return "ProPhrase for Windows";
    return "ProPhrase Desktop";
  }
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS browser";
  if (/Android/i.test(userAgent)) return "Android browser";
  if (/Mac/i.test(navigator.platform)) return "Mac browser";
  if (/Win/i.test(navigator.platform)) return "Windows browser";
  if (/Linux/i.test(navigator.platform)) return "Linux browser";
  return "Web browser";
}

function getDevicePlatform() {
  const desktop = (window as Window & {
    prophraseDesktop?: { isDesktop: boolean };
  }).prophraseDesktop;
  return desktop?.isDesktop ? "desktop" : "web";
}

export function WorkspaceClient() {
  const [activeView, setActiveView] = useState<WorkspaceView>("rewrite");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("rephrase");
  const [selectedTone, setSelectedTone] = useState<Tone>("Professional");
  const [inputText, setInputText] = useState("");
  const [lastInput, setLastInput] = useState("");
  const [lastSourceText, setLastSourceText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [templates, setTemplates] = useState<RewriteTemplate[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [creditBillingEnabled, setCreditBillingEnabled] = useState(false);
  const [planFeatureGatingEnabled, setPlanFeatureGatingEnabled] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState("");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState("Preparing rewrite...");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(workspacePreferenceDefaults);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [existingNoticeRequired, setExistingNoticeRequired] = useState(false);
  const [userName, setUserName] = useState("ProPhrase user");
  const [userEmail, setUserEmail] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Web browser");
  const [universalItem, setUniversalItem] =
    useState<UniversalClipboardMetadata | null>(null);
  const [universalMessage, setUniversalMessage] = useState("");
  const [universalBusy, setUniversalBusy] = useState(false);
  const [universalClock, setUniversalClock] = useState(() => Date.now());
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const mobileAccountMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(
    null,
  );
  const speechBaseTextRef = useRef("");
  const finalTranscriptRef = useRef("");

  const hasConversation = Boolean(lastInput || outputText || isLoading);
  const hasStoredConversation = threadMessages.length > 0;
  const userInitial = (userName || userEmail || "P").trim().charAt(0).toUpperCase();
  const planLabel = creditBalance
    ? `${creditBalance.plan === "free" ? "Free" : creditBalance.plan === "plus" ? "Plus" : "Pro"}${creditBalance.billingInterval === "annual" ? " Annual" : creditBalance.billingInterval === "monthly" ? " Monthly" : ""}`
    : usage?.isPro
      ? usage.plan === "pro_yearly" ? "Pro Yearly" : "Pro Monthly"
      : "Free";
  const entitlementPlan: "free" | "plus" | "pro" = creditBalance?.plan ??
    (usage?.plan === "pro" ? "pro" : usage?.plan === "plus" || usage?.plan === "pro_monthly" || usage?.plan === "pro_yearly" ? "plus" : "free");
  const hasPlanData = Boolean(creditBalance || usage);
  const upgradeTarget = hasPlanData
    ? entitlementPlan === "free"
      ? "plus"
      : entitlementPlan === "plus"
        ? "pro"
        : null
    : null;
  const upgradeLabel = upgradeTarget === "plus"
    ? "Upgrade to Plus"
    : upgradeTarget === "pro"
      ? "Upgrade to Pro"
      : "";
  const upgradeHref = upgradeTarget ? `/pricing#plan-${upgradeTarget}` : "/pricing";
  const creditEstimate = useMemo(() => {
    if (!creditBillingEnabled || !inputText.trim()) return null;
    try { return estimateCreditCost("rephrase", inputText); } catch { return null; }
  }, [creditBillingEnabled, inputText]);
  const lowCreditMessage = useMemo(() => {
    if (!creditBalance) return "";
    if (creditBalance.available === 0) return `No credits remaining. Refreshes ${creditBalance.nextRefreshAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(creditBalance.nextRefreshAt)) : "at the next credit period"}.`;
    if (creditBalance.plan === "free" && creditBalance.available <= 5) return `${creditBalance.available} credits remaining today.`;
    if (creditBalance.plan !== "free" && creditBalance.available / Math.max(1, creditBalance.allowance) <= 0.2) return `${creditBalance.available} of ${creditBalance.allowance} monthly credits remain.`;
    return "";
  }, [creditBalance]);
  const universalExpiresAt = universalItem
    ? Date.parse(universalItem.expiresAt)
    : 0;
  const isUniversalCopyActive =
    Boolean(universalItem) &&
    universalItem?.status === "available" &&
    !universalItem.isExpired &&
    universalExpiresAt > universalClock;
  const canClaimUniversalItem =
    isUniversalCopyActive &&
    Boolean(universalItem) &&
    universalItem.sourceDeviceId !== deviceId;

  useEffect(() => {
    if (!universalExpiresAt || universalItem?.status !== "available") return;

    const expiryTimer = window.setTimeout(
      () => setUniversalClock(Date.now()),
      Math.max(0, universalExpiresAt - Date.now()) + 50,
    );
    return () => window.clearTimeout(expiryTimer);
  }, [universalExpiresAt, universalItem?.status]);

  async function refreshThreads() {
    try {
      const response = await fetch("/api/threads");
      if (!response.ok) return;

      const threadData = (await response.json()) as {
        threads?: ThreadSummary[];
      };
      setThreads(threadData.threads ?? []);
    } catch {
      // Background refresh failures should not surface as runtime errors.
    }
  }

  function upsertThreadSummary(thread: ThreadSummary) {
    setThreads((current) => [
      thread,
      ...current.filter((existing) => existing.id !== thread.id),
    ]);
  }

  async function copyToLocalClipboard(
    text: string,
    successMessage = "Copied to this device.",
  ) {
    try {
      await navigator.clipboard?.writeText(text);
      setUniversalMessage(successMessage);
    } catch {
      setUniversalMessage("Copy failed. Select the text and copy manually.");
    }
  }

  async function registerCurrentDevice(nextDeviceId: string, nextDeviceLabel: string) {
    try {
      await fetch("/api/universal-clipboard/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: nextDeviceId,
          label: nextDeviceLabel,
          platform: getDevicePlatform(),
          capabilities: ["universal-copy", "universal-paste"],
        }),
      });
    } catch {
      // Device registration is optional and must not interrupt rewriting.
    }
  }

  async function refreshUniversalClipboard(nextDeviceId = deviceId) {
    if (!nextDeviceId) return;

    try {
      const response = await fetch(
        `/api/universal-clipboard?deviceId=${encodeURIComponent(nextDeviceId)}`,
      );
      if (!response.ok) return;

      const data = (await response.json().catch(() => null)) as
        | { item?: UniversalClipboardMetadata | null }
        | null;
      setUniversalItem(data?.item ?? null);
    } catch {
      // Clipboard polling is best-effort.
    }
  }

  async function createUniversalCopy(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    setUniversalBusy(true);
    setUniversalMessage("");
    try {
      const activeDeviceId = deviceId || getOrCreateDeviceId();
      const activeDeviceLabel = deviceLabel || getBrowserDeviceLabel();
      if (!deviceId) setDeviceId(activeDeviceId);
      if (!deviceLabel) setDeviceLabel(activeDeviceLabel);

      const response = await fetch("/api/universal-clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: activeDeviceId,
          deviceLabel: activeDeviceLabel,
          text: trimmedText,
          expiresInSeconds: universalClipboardTtlSeconds,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | ({ item?: UniversalClipboardMetadata } & ApiErrorResponse)
        | null;

      if (!response.ok || !data?.item) {
        throw new Error(data?.message || "Unable to create universal copy.");
      }

      setUniversalItem(data.item);
      await copyToLocalClipboard(
        trimmedText,
        "Universal copy is active for five minutes on one trusted device.",
      );
    } catch (caughtError) {
      setUniversalMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create universal copy.",
      );
    } finally {
      setUniversalBusy(false);
    }
  }

  async function claimUniversalCopy() {
    if (!universalItem || universalBusy) return;

    setUniversalBusy(true);
    setUniversalMessage("");
    try {
      const activeDeviceId = deviceId || getOrCreateDeviceId();
      const activeDeviceLabel = deviceLabel || getBrowserDeviceLabel();

      const response = await fetch(
        `/api/universal-clipboard/${universalItem.id}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: activeDeviceId,
            deviceLabel: activeDeviceLabel,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | ({ item?: UniversalClipboardMetadata; text?: string } & ApiErrorResponse)
        | null;

      if (!response.ok || !data?.item || !data.text) {
        throw new Error(data?.message || "Unable to claim universal copy.");
      }

      setUniversalItem(data.item);
      await copyToLocalClipboard(data.text);
      setUniversalMessage("Claimed on this browser. Paste anywhere on this device.");
    } catch (caughtError) {
      setUniversalMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to claim universal copy.",
      );
      await refreshUniversalClipboard();
    } finally {
      setUniversalBusy(false);
    }
  }

  async function loadThreadConversation(nextThreadId: string) {
    setError("");
    setUpgradeMessage("");
    try {
      const response = await fetch(`/api/threads/${nextThreadId}`);
      const data = (await response.json().catch(() => null)) as
        | {
            thread?: ThreadSummary;
            messages?: ThreadMessage[];
            message?: string;
          }
        | null;

      if (!response.ok || !data?.thread) {
        setError(data?.message || "Unable to load this chat.");
        return;
      }

      setActiveView("rewrite");
      setThreadId(data.thread.id);
      setSelectedTone(isTone(data.thread.tone) ? data.thread.tone : "Professional");
      const messages = data.messages ?? [];
      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
      const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
      setThreadMessages(messages);
      setInputText("");
      setLastInput("");
      setLastSourceText(lastUserMessage?.content ?? "");
      setOutputText(lastAssistantMessage?.content ?? "");
    } catch {
      setError("Unable to load this chat. Please try again.");
    }
  }

  useEffect(() => {
    async function loadInitialState() {
      try {
        const response = await fetch("/api/workspace/bootstrap");
        const data = (await response.json().catch(() => null)) as
          | {
              usage?: UsageSummary;
              creditBilling?: {
                enabled?: boolean;
                shadowMode?: boolean;
                planFeatureGatingEnabled?: boolean;
                balance?: CreditBalance | null;
              };
              threads?: ThreadSummary[];
              templates?: RewriteTemplate[];
              user?: {
                email?: string;
                name?: string;
              };
              preferences?: {
                preferences?: UserPreferences;
                available?: boolean;
                onboardingRequired?: boolean;
                existingNoticeRequired?: boolean;
              };
              message?: string;
            }
          | null;

        if (!response.ok || !data) {
          throw new Error(data?.message || "Unable to load your workspace.");
        }

        setUsage(data.usage ?? null);
        setCreditBillingEnabled(Boolean(data.creditBilling?.enabled));
        setPlanFeatureGatingEnabled(Boolean(data.creditBilling?.planFeatureGatingEnabled));
        setCreditBalance(data.creditBilling?.balance ?? null);
        setThreads(data.threads ?? []);
        setThreadId(data.threads?.[0]?.id ?? null);
        setTemplates(data.templates ?? []);
        setUserEmail(data.user?.email ?? "");
        setUserName(data.user?.name || "ProPhrase user");
        if (data.preferences?.preferences) {
          const nextPreferences = data.preferences.preferences;
          setPreferences(nextPreferences);
          setSelectedTone(quickStyleById[nextPreferences.rephrase.defaultStyle].tone);
          setOnboardingRequired(Boolean(data.preferences.onboardingRequired));
          setExistingNoticeRequired(Boolean(data.preferences.existingNoticeRequired));
        }
        setPreferencesLoaded(true);
      } catch {
        setError("Unable to load your workspace. Please refresh.");
        setPreferencesLoaded(true);
      }
    }

    void loadInitialState();
  }, []);

  useEffect(() => {
    let inFlight = false;
    let controller: AbortController | null = null;

    async function refreshCreditBalance() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/credits/balance", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as
          | { enabled?: boolean; balance?: CreditBalance | null }
          | null;

        if (!response.ok || !data) return;
        setCreditBillingEnabled(Boolean(data.enabled));
        setCreditBalance(data.balance ?? null);
      } catch {
        // Keep the last known balance when a background refresh cannot complete.
      } finally {
        inFlight = false;
        controller = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refreshCreditBalance();
    }

    window.addEventListener("focus", refreshCreditBalance);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller?.abort();
      window.removeEventListener("focus", refreshCreditBalance);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;
    const nextDeviceId = getOrCreateDeviceId();
    const nextDeviceLabel = getBrowserDeviceLabel();
    const publishDeviceState = window.setTimeout(() => {
      setDeviceId(nextDeviceId);
      setDeviceLabel(nextDeviceLabel);
    }, 0);

    void registerCurrentDevice(nextDeviceId, nextDeviceLabel);

    async function refreshDeviceClipboard() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/universal-clipboard?deviceId=${encodeURIComponent(nextDeviceId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;

        const data = (await response.json().catch(() => null)) as
          | { item?: UniversalClipboardMetadata | null }
          | null;
        if (active) setUniversalItem(data?.item ?? null);
      } catch {
        // Clipboard polling is best-effort.
      } finally {
        inFlight = false;
        controller = null;
      }
    }

    void refreshDeviceClipboard();

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshDeviceClipboard();
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshDeviceClipboard();
      }
    }, universalClipboardRefreshMs);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(publishDeviceState);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeAccountMenu(event: MouseEvent) {
      if (
        !accountMenuRef.current?.contains(event.target as Node) &&
        !mobileAccountMenuRef.current?.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!isLoading) return;

    const steps = [
      "Preparing rewrite...",
      "Finding the cleanest phrasing...",
      "Polishing tone...",
      "Saving conversation...",
    ];
    let index = 0;
    const interval = window.setInterval(() => {
      index = Math.min(index + 1, steps.length - 1);
      setProcessingStep(steps[index]);
    }, 1100);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  async function rewriteMessage(options: RewriteOptions = {}) {
    const nextTone = options.tone ?? selectedTone;
    const sourceText = options.text ?? inputText;
    const trimmedText = sourceText.trim();
    const displayInput = options.displayInput ?? trimmedText;
    setError("");
    setUpgradeMessage("");

    if (!trimmedText) {
      setError("Type what you want to say first.");
      return;
    }

    if (Array.from(trimmedText).length > 5000) {
      setError("Please keep your message under 5,000 characters.");
      return;
    }

    if (!isTone(nextTone)) {
      setError("Choose a valid tone.");
      return;
    }

    setProcessingStep("Preparing rewrite...");
    setIsLoading(true);
    setLastInput(displayInput);
    setLastSourceText(trimmedText);
    setOutputText("");

    const abortController = new AbortController();
    const timeout = window.setTimeout(
      () => abortController.abort(),
      rewriteRequestTimeoutMs,
    );
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          text: trimmedText,
          tone: nextTone,
          ...(options.instruction ? { instruction: options.instruction } : {}),
          ...(threadId ? { threadId } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as ({
        result?: string;
        threadId?: string;
        thread?: ThreadSummary;
        userMessage?: ThreadMessage;
        assistantMessage?: ThreadMessage;
        usage?: UsageSummary;
        credits?: { charged: number; remaining: number; nextRefreshAt: string | null };
      } & ApiErrorResponse) | null;

      if (!response.ok) {
        if (data?.upgrade || ["INSUFFICIENT_CREDITS", "INPUT_LIMIT_EXCEEDED", "PLAN_UPGRADE_REQUIRED"].includes(data?.error ?? "") || data?.error?.includes("LIMIT")) {
          setUpgradeMessage(
            data?.message ||
              "You’ve used your free rewrites for today. Compare Plus and Pro credit plans.",
          );
          if (data?.usage) setUsage(data.usage);
          return;
        }
        throw new Error(data?.message || data?.error || "Something went wrong. Please try again.");
      }

      if (!data?.result?.trim()) {
        throw new Error("ProPhrase did not return a response. Please try again.");
      }

      setOutputText(data.result);
      setThreadId(data.threadId ?? threadId);
      setUsage(data.usage ?? usage);
      if (data.credits && creditBalance) {
        setCreditBalance({ ...creditBalance, available: data.credits.remaining, nextRefreshAt: data.credits.nextRefreshAt });
      }
      if (data.thread) {
        upsertThreadSummary(data.thread);
      }
      if (data.userMessage && data.assistantMessage) {
        setThreadMessages((current) => [
          ...current,
          data.userMessage as ThreadMessage,
          data.assistantMessage as ThreadMessage,
        ]);
      }
      if (!data.thread) void refreshThreads();
      if (options.clearComposer ?? true) {
        setInputText("");
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof DOMException && caughtError.name === "AbortError"
          ? "The rewrite took too long. Please try again."
          : caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }

  function handleToneChange(tone: Tone) {
    if (
      planFeatureGatingEnabled &&
      entitlementPlan === "free" &&
      !["Professional", "Polite", "Shorter"].includes(tone)
    ) {
      setUpgradeMessage(`${tone} is available on Plus and Pro.`);
      return;
    }
    setSelectedTone(tone);

    if (!outputText && !lastInput) {
      return;
    }

    const textToRewrite = outputText || lastSourceText || lastInput;
    void rewriteMessage({
      text: textToRewrite,
      tone,
      displayInput: `Rewrite in ${tone} tone`,
      instruction: `Rewrite the current message in ${tone} tone.`,
      clearComposer: false,
    });
  }

  function applySuggestion(label: string, instruction: string) {
    if (!outputText) return;

    void rewriteMessage({
      text: outputText,
      displayInput: label,
      instruction,
      clearComposer: false,
    });
  }

  function startNewRewrite() {
    setActiveView("rewrite");
    setThreadId(null);
    setInputText("");
    setLastInput("");
    setLastSourceText("");
    setOutputText("");
    setThreadMessages([]);
    setError("");
    setUpgradeMessage("");
    setInterimTranscript("");
    setVoiceStatus("idle");
    finalTranscriptRef.current = "";
    speechBaseTextRef.current = "";
  }

  function openHistoryThread(thread: ThreadSummary) {
    void loadThreadConversation(thread.id);
  }

  function applyTemplate(template: RewriteTemplate) {
    setActiveView("rewrite");
    setThreadId(null);
    setSelectedTone(template.tone);
    setInputText(template.body);
    setLastInput("");
    setLastSourceText("");
    setOutputText("");
    setThreadMessages([]);
    setError("");
    setUpgradeMessage("");
    setInterimTranscript("");
  }

  function buildVoiceComposerText({
    baseText,
    finalTranscript,
    interim,
  }: {
    baseText: string;
    finalTranscript: string;
    interim: string;
  }) {
    return [baseText.trim(), finalTranscript.trim(), interim.trim()]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trimStart();
  }

  function voiceErrorMessage(errorCode: string) {
    switch (errorCode) {
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone permission is blocked. Allow microphone access and try again.";
      case "no-speech":
        return "I could not hear anything. Try speaking a little closer to the mic.";
      case "audio-capture":
        return "No microphone was found. Check your input device and try again.";
      case "network":
        return "Voice recognition needs a working network connection in this browser.";
      case "aborted":
        return "";
      default:
        return "Voice input could not start. Please try again.";
    }
  }

  function stopVoiceInput() {
    if (!recognitionRef.current) {
      setVoiceStatus("idle");
      setIsListening(false);
      return;
    }

    setVoiceStatus("processing");
    try {
      recognitionRef.current.stop();
    } catch {
      setVoiceStatus("idle");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }

  function startVoiceInput() {
    if (planFeatureGatingEnabled && entitlementPlan === "free") {
      setUpgradeMessage("Voice input is available on Plus and Pro.");
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (isListening) {
      stopVoiceInput();
      return;
    }

    if (voiceStatus !== "idle") return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    speechBaseTextRef.current = inputText;
    finalTranscriptRef.current = "";

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("listening");
      setError("");
    };

    recognition.onresult = (event) => {
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript.trim() ?? "";
        if (!transcript) continue;

        if (result.isFinal) {
          finalTranscriptRef.current = buildVoiceComposerText({
            baseText: "",
            finalTranscript: finalTranscriptRef.current,
            interim: transcript,
          });
        } else {
          interim = buildVoiceComposerText({
            baseText: interim,
            finalTranscript: "",
            interim: transcript,
          });
        }
      }

      setInterimTranscript(interim);
      setInputText(
        buildVoiceComposerText({
          baseText: speechBaseTextRef.current,
          finalTranscript: finalTranscriptRef.current,
          interim,
        }),
      );
    };

    recognition.onerror = (event) => {
      const message = voiceErrorMessage(event.error);
      if (message) setError(message);
      setInterimTranscript("");
      setVoiceStatus("idle");
      setIsListening(false);
    };

    recognition.onnomatch = () => {
      setError("I could not turn that audio into text. Try again.");
    };

    recognition.onend = () => {
      const finalText = buildVoiceComposerText({
        baseText: speechBaseTextRef.current,
        finalTranscript: finalTranscriptRef.current,
        interim: "",
      });

      setInputText((current) => {
        if (finalText) return finalText;
        return current;
      });
      setInterimTranscript("");
      setVoiceStatus("idle");
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setError("");
    setInterimTranscript("");
    setVoiceStatus("starting");

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceStatus("idle");
      setIsListening(false);
      setError("Voice input is already starting. Please try again.");
    }
  }

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      setError("Unable to sign out. Please try again.");
    }
  }

  async function dismissExistingPreferenceNotice() {
    setExistingNoticeRequired(false);
    try {
      const state = await patchPreferences({ existingNoticeDismissed: true });
      setPreferences(state.preferences);
    } catch {
      setExistingNoticeRequired(true);
    }
  }

  return (
    <main className="workspace-page flex h-[100dvh] flex-col overflow-hidden bg-[#fbfbfb] text-[#191c1d] md:flex-row">
      {preferencesFeatureEnabled && preferencesLoaded && onboardingRequired ? (
        <QuickStylesOnboarding
          initialPreferences={preferences}
          onComplete={(nextPreferences) => {
            setPreferences(nextPreferences);
            setSelectedTone(quickStyleById[nextPreferences.rephrase.defaultStyle].tone);
            setOnboardingRequired(false);
          }}
        />
      ) : null}
      <aside className="workspace-sidebar hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-[#e1e3e4] bg-white px-6 pb-6 md:flex">
        <Link className="workspace-brand -mx-6 mb-8 flex h-16 shrink-0 items-center gap-3 border-b border-[#e1e3e4] px-6" href="/">
          <Image src="/prophrase-logo-transparent.png" alt="ProPhrase" width={36} height={36} className="h-9 w-9 object-contain" priority />
          <div><p className="text-lg font-bold leading-5 text-primary">ProPhrase</p><p className="mt-0.5 text-[11px] leading-4 text-[#6b7280]">Work message assistant</p></div>
        </Link>

        <nav className="flex flex-col gap-1">
          {sidebarItems.filter((item) => item.view !== "rewrite").map((item) => {
            const isActive = activeView === item.view;
            const label = item.view === "history" ? "History" : item.label;

            return (
              <button
                className={
                  isActive
                    ? "workspace-nav-item is-active flex items-center gap-3 rounded-lg bg-[#f3f4f5] px-3 py-2.5 text-left text-primary transition-all"
                    : "workspace-nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#6b7280] transition-all hover:bg-[#f3f4f5] hover:text-primary"
                }
                key={item.view}
                onClick={() => setActiveView(item.view)}
                type="button"
              >
                <Icon className="text-xl" name={item.icon} />
                <span className="text-sm font-medium leading-5">{label}</span>
              </button>
            );
          })}
          <Link className="workspace-nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#6b7280] transition-all hover:bg-[#f3f4f5] hover:text-primary" href="/settings">
            <Icon className="text-xl" name="user" />
            <span className="text-sm font-medium leading-5">Settings</span>
          </Link>
        </nav>

        <div className="mt-7 space-y-3">
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Recent
          </p>
          <div className="space-y-1">
            {threads.slice(0, 6).map((thread) => (
              <button
                className={
                  thread.id === threadId
                    ? "w-full truncate rounded-xl bg-surface-container px-4 py-2 text-left text-sm font-medium text-primary"
                    : "w-full truncate rounded-xl px-4 py-2 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-container hover:text-primary"
                }
                key={thread.id}
                onClick={() => openHistoryThread(thread)}
                type="button"
              >
                {thread.title || "Untitled rewrite"}
              </button>
            ))}
            {!threads.length ? (
              <p className="px-4 py-2 text-sm leading-5 text-text-muted">
                Your rewrites will appear here.
              </p>
            ) : null}
          </div>
        </div>

        <div className="workspace-universal-card mt-5 rounded-2xl border border-border-subtle bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Universal Paste
              </p>
              <p className="mt-1 text-sm font-semibold leading-5 text-primary">
                {universalItem
                  ? isUniversalCopyActive
                    ? universalItem.sourceDeviceId === deviceId
                      ? "Waiting for a device"
                      : `Ready from ${universalItem.sourceDeviceLabel}`
                    : universalItem.status === "claimed"
                      ? `Claimed on ${universalItem.claimedByDeviceLabel || "a device"}`
                      : "Latest copy expired"
                  : "No active copy"}
              </p>
            </div>
            <span
              className={
                isUniversalCopyActive
                  ? "mt-1 h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
                  : "mt-1 h-2.5 w-2.5 rounded-full bg-border-subtle"
              }
              title={isUniversalCopyActive ? "Universal Copy active for five minutes" : "No active Universal Copy"}
            />
          </div>
          {universalItem ? (
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">
              {universalItem.preview}
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-text-muted">
              Use Copy Universal on any ProPhrase response.
            </p>
          )}
          {canClaimUniversalItem ? (
            <button
              className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition-all hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60"
              disabled={universalBusy}
              onClick={() => void claimUniversalCopy()}
              type="button"
            >
              Claim to this browser
            </button>
          ) : null}
          {universalMessage ? (
            <p className="mt-3 text-xs font-medium leading-5 text-text-muted">
              {universalMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-3">
          <div className="workspace-credits-card rounded-2xl border border-border-subtle bg-surface-container-low p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase leading-4 text-text-muted">
                {creditBillingEnabled ? "Credits" : usage?.isPro ? "Plan" : "Credits"}
              </span>
              <span className="text-xs font-bold leading-4 text-primary">
                {creditBalance
                  ? `${creditBalance.available} / ${creditBalance.allowance}`
                  : usage?.isPro
                  ? "Pro"
                  : usage
                    ? `${usage.rewriteRemaining} left`
                    : "Loading"}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full bg-primary"
                style={{
                  width: creditBalance
                    ? `${Math.max(0, Math.min(100, (creditBalance.available / Math.max(1, creditBalance.allowance)) * 100))}%`
                    : usage?.isPro
                    ? "100%"
                    : usage
                      ? `${Math.max(0, Math.min(100, (usage.rewriteRemaining / usage.rewriteLimit) * 100))}%`
                      : "40%",
                }}
              />
            </div>
            {lowCreditMessage ? <p className="mt-2 text-xs font-semibold leading-4 text-text-muted" role="status">{lowCreditMessage}</p> : null}
          </div>

          <div className="relative" ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div className="absolute bottom-14 left-0 z-50 w-full rounded-2xl border border-border-subtle bg-white p-2 shadow-xl ring-1 ring-black/5">
                <div className="border-b border-border-subtle px-3 py-3">
                  <p className="truncate text-sm font-semibold leading-5 text-primary">
                    {userName}
                  </p>
                  {userEmail ? (
                    <p className="truncate text-xs leading-5 text-text-muted">
                      {userEmail}
                    </p>
                  ) : null}
                </div>
                <Link
                  className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
                  href="/account/billing"
                >
                  <Icon className="text-lg" name="user" />
                  <span>Manage billing &amp; credits</span>
                </Link>
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
                  onClick={() => void signOut()}
                  type="button"
                >
                  <Icon className="text-lg" name="log-out" />
                  <span>Logout</span>
                </button>
                <Link className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-surface-container" href="/settings">
                  <Icon className="text-lg" name="user" />
                  <span>App Settings</span>
                </Link>
              </div>
            ) : null}

            <button
              aria-expanded={accountMenuOpen}
              className="workspace-account flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-container"
              onClick={() => setAccountMenuOpen((open) => !open)}
              type="button"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffd88e] text-sm font-bold text-[#261900]">
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-5 text-primary">
                  {userName}
                </span>
                <span className="block text-xs leading-4 text-text-muted">
                  {planLabel}
                </span>
              </span>
            </button>
          </div>
        </div>
      </aside>

      <section className={activeView === "rewrite" && workspaceMode === "rephrase" && !hasConversation && !hasStoredConversation && !isLoading ? "workspace-main relative flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[#fbfbfb]" : "workspace-main relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#fbfbfb]"}>
        <header className="workspace-header hidden h-16 shrink-0 items-center justify-between border-b border-[#e1e3e4] bg-white px-8 md:flex">
          <div className="flex items-center">
            {activeView === "rewrite" ? <nav className="workspace-mode-switch flex rounded-full bg-[#f3f4f5] p-1" aria-label="Workspace mode">
              <button aria-pressed={workspaceMode === "rephrase"} className={workspaceMode === "rephrase" ? "min-h-9 rounded-full bg-black px-6 text-sm font-semibold text-white" : "min-h-9 rounded-full px-6 text-sm font-semibold text-[#6b7280] hover:bg-white hover:text-primary"} onClick={() => setWorkspaceMode("rephrase")} type="button">Rephrase</button>
              <button aria-pressed={workspaceMode === "outcome"} className={workspaceMode === "outcome" ? "min-h-9 rounded-full bg-black px-6 text-sm font-semibold text-white" : "min-h-9 rounded-full px-6 text-sm font-semibold text-[#6b7280] hover:bg-white hover:text-primary"} onClick={() => setWorkspaceMode("outcome")} type="button">Outcome Assistant</button>
            </nav> : null}
          </div>
          <div className="flex items-center gap-2">
            {upgradeTarget ? (
              <Link className="workspace-upgrade-cta" href={upgradeHref}>
                {upgradeLabel}
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {creditBalance ? (
              <Link className="workspace-header-credit" href="/account/billing">
                <span aria-hidden="true" />
                {creditBalance.available} credits left
              </Link>
            ) : null}
            <button aria-label="Open history" className="rounded-full p-2 text-[#6b7280] hover:bg-[#f3f4f5]" onClick={() => setActiveView("history")} type="button"><Icon className="text-xl" name="history" /></button>
          </div>
        </header>
        <div
          className="workspace-mobile-header shrink-0 border-b border-border-subtle bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
          ref={mobileAccountMenuRef}
        >
          <div className="flex items-center justify-between gap-3">
            <Link className="flex min-w-0 items-center gap-2" href="/">
              <Image
                src="/prophrase-logo-transparent.png"
                alt="ProPhrase"
                width={30}
                height={30}
                className="h-8 w-8 rounded-md object-cover"
                priority
              />
              <span className="truncate text-xl font-bold leading-7 text-primary">
                ProPhrase
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {upgradeTarget ? (
                <Link className="workspace-upgrade-cta workspace-upgrade-cta-mobile" href={upgradeHref}>
                  {upgradeLabel}
                </Link>
              ) : null}
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffd88e] text-sm font-bold text-[#261900]"
                onClick={() => setAccountMenuOpen((open) => !open)}
                type="button"
              >
                {userInitial}
              </button>
            </div>
          </div>

          {accountMenuOpen ? (
            <div className="mt-3 rounded-2xl border border-border-subtle bg-white p-3 shadow-lg">
              <p className="truncate text-sm font-semibold leading-5 text-primary">
                {userName}
              </p>
              {userEmail ? (
                <p className="truncate text-xs leading-5 text-text-muted">
                  {userEmail}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2 text-xs font-semibold text-text-muted">
                <span>{creditBillingEnabled ? "Credits" : usage?.isPro ? "Plan" : "Credits"}</span>
                <span className="text-primary">
                  {creditBalance
                    ? `${creditBalance.available} left`
                    : usage?.isPro
                    ? "Pro"
                    : usage
                      ? `${usage.rewriteRemaining} left`
                      : "Loading"}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <Link className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-center text-xs font-semibold text-primary" href="/settings">Settings</Link>
                <Link
                  className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-center text-xs font-semibold text-primary"
                  href="/account/billing"
                >
                  Billing
                </Link>
                <button
                  className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                  onClick={() => void signOut()}
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}

          <nav className="mt-3 grid grid-cols-4 gap-2">
            {sidebarItems.map((item) => {
              const isActive = activeView === item.view;

              return (
                <button
                  className={
                    isActive
                      ? "flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-2 text-xs font-semibold text-white"
                      : "flex h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white px-2 text-xs font-semibold text-text-muted"
                  }
                  key={item.label}
                  onClick={() => setActiveView(item.view)}
                  type="button"
                >
                  <Icon className="text-base" name={item.icon} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
            <Link className="flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-white px-2 text-xs font-semibold text-text-muted" href="/settings">Settings</Link>
          </nav>
        </div>

        {activeView === "rewrite" ? (
          <>
            {preferencesFeatureEnabled && existingNoticeRequired ? (
              <div className="shrink-0 border-b border-border-subtle bg-[#fff8e8] px-4 py-3 md:px-10">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-primary">Choose the styles you want to see while rewriting.</p>
                  <div className="flex gap-3">
                    <Link className="text-sm font-semibold underline" href="/settings#rephrase">Open Settings</Link>
                    <button className="text-sm font-semibold text-text-muted" onClick={() => void dismissExistingPreferenceNotice()} type="button">Keep defaults</button>
                  </div>
                </div>
              </div>
            ) : null}
            {outcomeAssistantEnabled ? (
              <div className="shrink-0 border-b border-border-subtle bg-[#faf9f6]/90 px-4 backdrop-blur-md md:hidden">
                <div className="mx-auto flex h-16 max-w-5xl items-center gap-8">
                  <button
                    className={
                      workspaceMode === "rephrase"
                        ? "h-16 border-b-2 border-primary px-1 text-xs font-semibold text-primary"
                        : "h-16 border-b-2 border-transparent px-1 text-xs font-medium text-text-muted hover:text-primary"
                    }
                    onClick={() => setWorkspaceMode("rephrase")}
                    type="button"
                  >
                    Rephrase
                  </button>
                  <button
                    className={
                      workspaceMode === "outcome"
                        ? "h-16 border-b-2 border-primary px-1 text-xs font-semibold text-primary"
                        : "h-16 border-b-2 border-transparent px-1 text-xs font-medium text-text-muted hover:text-primary"
                    }
                    onClick={() => setWorkspaceMode("outcome")}
                    type="button"
                  >
                    Outcome Assistant
                  </button>
                </div>
              </div>
            ) : null}
            {outcomeAssistantEnabled && workspaceMode === "outcome" ? (
              <OutcomeAssistantPanel
                key={`${preferences.outcomeAssistant.defaultChannel}:${preferences.outcomeAssistant.defaultVariant}`}
                plan={entitlementPlan}
                planFeatureGatingEnabled={planFeatureGatingEnabled}
                creditBillingEnabled={creditBillingEnabled}
                creditBalance={creditBalance}
                onCreditsChanged={(credits) => {
                  setCreditBalance((current) => current ? {
                    ...current,
                    available: credits.remaining,
                    nextRefreshAt: credits.nextRefreshAt,
                  } : current);
                }}
                preferences={preferencesFeatureEnabled ? preferences.outcomeAssistant : undefined}
              />
            ) : (
              <>
            {!hasConversation && !hasStoredConversation && !isLoading ? <div className="workspace-intro shrink-0 px-4 pt-10 text-center md:px-10 md:pt-16">
              <span className="workspace-eyebrow"><Icon name="spark" /> Write it rough. Send it right.</span>
              <h1 className="text-4xl font-bold tracking-tight text-primary md:text-[56px] md:leading-[1.1]">Turn the rough thought into the right message.</h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#6b7280] md:text-lg">Paste what you mean, choose how it should sound, and get a message ready to send.</p>
            </div> : null}
            <div className={hasConversation || hasStoredConversation || isLoading ? "workspace-style-section is-conversation shrink-0 border-b border-[#e1e3e4] bg-white px-4 py-3 md:px-10" : "workspace-style-section shrink-0 px-4 pt-10 md:px-10 md:pt-14"}>
              <div className={hasConversation || hasStoredConversation || isLoading ? "workspace-style-card mx-auto max-w-4xl" : "workspace-style-card mx-auto max-w-4xl rounded-t-2xl border border-b-0 border-[#e1e3e4] bg-white px-5 pb-4 pt-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:px-8 md:pt-8"}>
            {preferencesFeatureEnabled ? <QuickStylesBar
              disabled={isLoading}
              onPreferencesChange={setPreferences}
              onSelect={handleToneChange}
              preferences={preferences}
              selectedTone={selectedTone}
            /> : (
              <div className="flex gap-2 overflow-x-auto md:justify-center">
                {tones.map((tone) => <button aria-pressed={selectedTone === tone} className={selectedTone === tone ? "min-h-9 shrink-0 rounded-full bg-black px-5 text-xs font-semibold text-white" : "min-h-9 shrink-0 rounded-full bg-[#f3f4f5] px-5 text-xs font-semibold text-[#6b7280]"} key={tone} onClick={() => handleToneChange(tone)} type="button">{tone}</button>)}
              </div>
            )}
              </div>
            </div>

            <div className={hasConversation || hasStoredConversation || isLoading ? "workspace-conversation flex-1 overflow-y-auto px-4 py-6 pb-40 md:px-10 md:py-8 md:pb-48" : "workspace-conversation shrink-0 px-4 md:px-10"}>
              <div className="mx-auto flex max-w-4xl flex-col gap-8">
                {hasStoredConversation ? (
                  <>
                    {threadMessages.map((message) =>
                      message.role === "user" ? (
                        <div className="flex flex-col items-end gap-2" key={message.id}>
                          <div className="workspace-user-message message-shadow max-w-[92%] rounded-2xl rounded-tr-none border border-border-subtle bg-surface-container px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                            <p className="whitespace-pre-wrap text-base leading-6 text-[#1a1c1a]">
                              {message.content}
                            </p>
                          </div>
                          <span className="px-2 text-xs font-semibold leading-4 text-text-muted">
                            You
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-2" key={message.id}>
                          <div className="mb-1 flex items-center gap-2">
                            <div className="workspace-ai-mark flex h-6 w-6 items-center justify-center rounded-md bg-primary text-white">
                              <Icon className="text-sm" name="spark" />
                            </div>
                            <span className="workspace-ai-label text-xs font-bold uppercase leading-4 text-primary">
                              ProPhrase AI
                            </span>
                          </div>
                          <div className="workspace-ai-message message-shadow relative max-w-[92%] overflow-hidden rounded-2xl rounded-tl-none border border-border-subtle bg-white px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ai-purple/5 to-transparent" />
                            <p className="workspace-ai-copy relative z-10 whitespace-pre-wrap text-base leading-relaxed">
                              {message.content}
                            </p>
                            <div className="workspace-message-actions relative z-10 mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
                              <button
                                className="flex items-center gap-1 text-text-muted transition-colors hover:text-primary"
                                onClick={() => void copyToLocalClipboard(message.content)}
                                type="button"
                              >
                                <Icon className="text-lg" name="copy" />
                                <span className="text-xs font-semibold leading-4">
                                  Copy
                                </span>
                              </button>
                              <button
                                className="flex items-center gap-1 text-text-muted transition-colors hover:text-primary disabled:cursor-wait disabled:opacity-60"
                                disabled={universalBusy}
                                onClick={() => void createUniversalCopy(message.content)}
                                type="button"
                              >
                                <Icon className="text-lg" name="spark" />
                                <span className="text-xs font-semibold leading-4">
                                  Copy Universal
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}

                    {isLoading ? (
                      <>
                        {lastInput ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="workspace-user-message message-shadow max-w-[92%] rounded-2xl rounded-tr-none border border-border-subtle bg-surface-container px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                              <p className="whitespace-pre-wrap text-base leading-6 text-[#1a1c1a]">
                                {lastInput}
                              </p>
                            </div>
                            <span className="px-2 text-xs font-semibold leading-4 text-text-muted">
                              You • now
                            </span>
                          </div>
                        ) : null}
                        <div className="flex flex-col items-start gap-2">
                          <div className="mb-1 flex items-center gap-2">
                            <div className="workspace-ai-mark flex h-6 w-6 items-center justify-center rounded-md bg-primary text-white">
                              <Icon className="text-sm" name="spark" />
                            </div>
                            <span className="workspace-ai-label text-xs font-bold uppercase leading-4 text-primary">
                              ProPhrase AI
                            </span>
                          </div>
                          <div className="workspace-ai-message message-shadow max-w-[92%] rounded-2xl rounded-tl-none border border-border-subtle bg-white px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                            <p className="workspace-ai-copy text-base leading-relaxed">
                              {processingStep}
                              <span className="ml-1 inline-flex w-5 justify-between align-middle">
                                <span className="h-1 w-1 animate-pulse rounded-full bg-text-muted" />
                                <span className="h-1 w-1 animate-pulse rounded-full bg-text-muted [animation-delay:160ms]" />
                                <span className="h-1 w-1 animate-pulse rounded-full bg-text-muted [animation-delay:320ms]" />
                              </span>
                            </p>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : hasConversation ? (
                  <>
                    {lastInput ? (
                      <div className="flex flex-col items-end gap-2">
                        <div className="workspace-user-message message-shadow max-w-[92%] rounded-2xl rounded-tr-none border border-border-subtle bg-surface-container px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                          <p className="whitespace-pre-wrap text-base leading-6 text-[#1a1c1a]">
                            {lastInput}
                          </p>
                        </div>
                        <span className="px-2 text-xs font-semibold leading-4 text-text-muted">
                          You • now
                        </span>
                      </div>
                    ) : null}

                    {isLoading || outputText ? (
                      <div className="flex flex-col items-start gap-2">
                        <div className="mb-1 flex items-center gap-2">
                          <div className="workspace-ai-mark flex h-6 w-6 items-center justify-center rounded-md bg-primary text-white">
                            <Icon className="text-sm" name="spark" />
                          </div>
                          <span className="workspace-ai-label text-xs font-bold uppercase leading-4 text-primary">
                            ProPhrase AI
                          </span>
                        </div>
                        <div className="workspace-ai-message message-shadow group relative max-w-[92%] overflow-hidden rounded-2xl rounded-tl-none border border-border-subtle bg-white px-4 py-3 md:max-w-[85%] md:px-6 md:py-4">
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ai-purple/5 to-transparent" />
                          <p className="workspace-ai-copy relative z-10 whitespace-pre-wrap text-base leading-relaxed">
                            {isLoading ? processingStep : outputText}
                          </p>
                          {isLoading ? (
                            <div className="relative z-10 mt-4 h-1.5 overflow-hidden rounded-full bg-surface-container">
                              <div className="h-full w-2/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-primary/70" />
                            </div>
                          ) : null}
                          {outputText ? (
                            <div className="workspace-message-actions mt-4 flex items-center gap-3 border-t border-border-subtle pt-3 opacity-100 transition-opacity">
                              <button
                                className="flex items-center gap-1 text-text-muted transition-colors hover:text-primary"
                                onClick={() => void copyToLocalClipboard(outputText)}
                                type="button"
                              >
                                <Icon className="text-lg" name="copy" />
                                <span className="text-xs font-semibold leading-4">
                                  Copy
                                </span>
                              </button>
                              <button
                                className="flex items-center gap-1 text-text-muted transition-colors hover:text-primary disabled:cursor-wait disabled:opacity-60"
                                disabled={universalBusy}
                                onClick={() => void createUniversalCopy(outputText)}
                                type="button"
                              >
                                <Icon className="text-lg" name="spark" />
                                <span className="text-xs font-semibold leading-4">
                                  Copy Universal
                                </span>
                              </button>
                              <button
                                className="flex items-center gap-1 text-text-muted transition-colors hover:text-primary"
                                onClick={() =>
                                  void rewriteMessage({
                                    text: lastSourceText || lastInput,
                                    displayInput: lastInput,
                                    clearComposer: false,
                                  })
                                }
                                type="button"
                              >
                                <Icon className="text-lg" name="refresh" />
                                <span className="text-xs font-semibold leading-4">
                                  Regenerate
                                </span>
                              </button>
                              <button
                                aria-label="Like"
                                className="ml-auto text-text-muted transition-colors hover:text-primary"
                                type="button"
                              >
                                <Icon className="text-lg" name="thumb-up" />
                              </button>
                              <button
                                aria-label="Dislike"
                                className="text-text-muted transition-colors hover:text-primary"
                                type="button"
                              >
                                <Icon className="text-lg" name="thumb-down" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {outputText ? (
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <button
                      className="workspace-suggestion flex items-center gap-1 rounded-full border border-ai-purple/20 bg-ai-purple/10 px-3 py-1.5 text-ai-purple transition-all hover:bg-ai-purple/20 disabled:opacity-60"
                      disabled={isLoading}
                      onClick={() =>
                        applySuggestion(
                          "Make it more polite",
                          "Make the current message more polite while keeping the same meaning.",
                        )
                      }
                      type="button"
                    >
                      <Icon className="text-base" name="magic" />
                      <span className="text-xs font-semibold leading-4">
                        Make it more polite
                      </span>
                    </button>
                    <button
                      className="workspace-suggestion flex items-center gap-1 rounded-full border border-ai-purple/20 bg-ai-purple/10 px-3 py-1.5 text-ai-purple transition-all hover:bg-ai-purple/20 disabled:opacity-60"
                      disabled={isLoading}
                      onClick={() =>
                        applySuggestion(
                          "Make it punchier",
                          "Make the current message punchier and more concise while keeping the same meaning.",
                        )
                      }
                      type="button"
                    >
                      <Icon className="text-base" name="bolt" />
                      <span className="text-xs font-semibold leading-4">
                        Make it punchier
                      </span>
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                    <p>{error}</p>
                    {lastSourceText ? (
                      <button
                        className="shrink-0 rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                        disabled={isLoading}
                        onClick={() => void rewriteMessage({ text: lastSourceText, displayInput: lastInput, clearComposer: false })}
                        type="button"
                      >
                        Try again
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {upgradeMessage ? (
                  <div className="rounded-3xl border border-border-subtle bg-white p-6 shadow-lg">
                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-primary">
                      More credits are needed
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {upgradeMessage} Compare Plus and Pro for more credits and features.
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <Link
                        className="rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-white"
                        href="/pricing"
                      >
                        View plans
                      </Link>
                      <Link
                        className="rounded-full border border-border-subtle px-5 py-3 text-center text-sm font-semibold text-primary"
                        href="/pricing"
                      >
                        Manage billing
                      </Link>
                      <button
                        className="rounded-full px-5 py-3 text-sm font-semibold text-text-muted"
                        onClick={() => setUpgradeMessage("")}
                        type="button"
                      >
                        Maybe later
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={hasConversation || hasStoredConversation || isLoading ? "workspace-composer-shell pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 md:p-8" : "workspace-composer-shell pointer-events-none relative z-10 mx-auto flex w-full max-w-4xl justify-center px-4 md:px-0"}
              id="composer"
            >
              <div className={hasConversation || hasStoredConversation || isLoading ? "workspace-composer is-conversation glass-effect pointer-events-auto flex w-full max-w-4xl items-center gap-1.5 rounded-[24px] border border-border-subtle p-2.5 shadow-2xl ring-1 ring-black/5 transition-all focus-within:border-black md:gap-2 md:rounded-[28px] md:p-3" : "workspace-composer pointer-events-auto relative flex w-full flex-col rounded-b-2xl border border-t-0 border-[#e1e3e4] bg-white px-5 pb-6 pt-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all focus-within:border-black md:min-h-[300px] md:px-8 md:pb-8"}>
                <button
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  aria-pressed={isListening}
                  className={
                    isListening
                      ? "rounded-xl bg-primary p-2.5 text-white transition-all md:p-3"
                      : hasConversation || hasStoredConversation || isLoading ? "rounded-2xl p-2.5 text-text-muted transition-all hover:bg-surface-container hover:text-primary md:p-3" : "absolute bottom-6 left-6 rounded-lg p-2 text-text-muted hover:bg-surface-container hover:text-primary"
                  }
                  disabled={
                    isLoading ||
                    voiceStatus === "starting" ||
                    voiceStatus === "processing"
                  }
                  onClick={startVoiceInput}
                  type="button"
                >
                  <Icon className="text-2xl" name="mic" />
                </button>
                <div className={hasConversation || hasStoredConversation || isLoading ? "min-w-0 flex-1 rounded-2xl px-1 transition-colors focus-within:bg-white/35" : "min-w-0 w-full flex-1"}>
                  <textarea
                    className={hasConversation || hasStoredConversation || isLoading ? "block h-12 max-h-28 w-full resize-none appearance-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-base leading-6 text-primary shadow-none outline-none ring-0 placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-0" : "block min-h-[220px] w-full resize-none rounded-xl border border-[#e1e3e4] bg-[#fafafa] p-6 text-base leading-7 text-primary outline-none ring-0 placeholder:text-[#9ca3af] focus:border-black/50 focus:ring-0 md:text-lg"}
                    onChange={(event) => setInputText(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        void rewriteMessage();
                      }
                    }}
                    placeholder={hasConversation || hasStoredConversation ? "Type what you want to say..." : "Paste your message here to start rephrasing..."}
                    rows={hasConversation || hasStoredConversation ? 1 : 6}
                    value={inputText}
                  />
                  {voiceStatus !== "idle" || interimTranscript ? (
                    <p
                      aria-live="polite"
                      className="truncate px-2 text-xs font-semibold leading-4 text-text-muted"
                    >
                      {voiceStatus === "starting"
                        ? "Starting microphone..."
                        : voiceStatus === "listening"
                          ? interimTranscript || "Listening..."
                          : "Finishing transcript..."}
                    </p>
                  ) : null}
                  {creditEstimate && creditBalance ? (
                    <p className="px-2 text-xs font-semibold leading-4 text-text-muted" aria-live="polite">
                      Estimate: {creditEstimate.creditCost} {creditEstimate.creditCost === 1 ? "credit" : "credits"} · {Math.max(0, creditBalance.available - creditEstimate.creditCost)} after success
                    </p>
                  ) : null}
                </div>
                <div className={hasConversation || hasStoredConversation || isLoading ? "flex shrink-0 items-center gap-2" : "mt-4 flex w-full shrink-0 items-center justify-end gap-2 border-t border-border-subtle pt-4"}>
                  <button
                    className={hasConversation || hasStoredConversation || isLoading ? "flex items-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-medium leading-5 text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-wait disabled:opacity-60 md:px-5" : "flex h-12 w-12 items-center justify-center rounded-xl bg-black p-0 text-sm font-semibold text-white shadow-md transition-all hover:bg-neutral-800 active:scale-95 disabled:cursor-wait disabled:opacity-60"}
                    disabled={isLoading}
                    onClick={() => void rewriteMessage()}
                    type="button"
                  >
                    <span className={hasConversation || hasStoredConversation || isLoading ? "hidden sm:inline" : "sr-only"}>{isLoading ? "Writing" : creditEstimate ? `Rewrite · ${creditEstimate.creditCost}` : "Rewrite"}</span>
                    <Icon className="text-xl" name="spark" />
                  </button>
                </div>
              </div>
            </div>
            {!hasConversation && !hasStoredConversation && !isLoading ? (
              <div className="workspace-benefit-grid mx-auto grid w-full max-w-4xl shrink-0 grid-cols-1 gap-6 px-4 pt-8 md:grid-cols-3 md:px-0 md:pt-12">
                <div className="workspace-benefit-card flex flex-col gap-4 rounded-2xl border border-[#e1e3e4] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-black"><Icon name="magic" /></span><div><p className="text-base font-bold text-primary">Meaning stays intact</p><p className="mt-2 text-sm leading-6 text-[#6b7280]">Your facts and intent stay fixed while the wording becomes clearer.</p></div></div>
                <div className="workspace-benefit-card flex flex-col gap-4 rounded-2xl border border-[#e1e3e4] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-black"><Icon name="spark" /></span><div><p className="text-base font-bold text-primary">Sounds like you</p><p className="mt-2 text-sm leading-6 text-[#6b7280]">Choose a style without writing a long prompt or sounding robotic.</p></div></div>
                <div className="workspace-benefit-card flex flex-col gap-4 rounded-2xl border border-[#e1e3e4] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-black"><Icon name="bolt" /></span><div><p className="text-base font-bold text-primary">Ready everywhere</p><p className="mt-2 text-sm leading-6 text-[#6b7280]">Copy the finished message here and paste it on any signed-in device.</p></div></div>
              </div>
            ) : null}
            {!hasConversation && !hasStoredConversation && !isLoading ? (
              <footer className="mx-auto mt-24 flex w-full max-w-4xl flex-col items-center justify-between gap-4 border-t border-[#e1e3e4] px-4 py-8 text-xs font-medium text-[#6b7280] md:flex-row md:px-0">
                <div className="flex flex-wrap items-center justify-center gap-6"><span>© 2026 ProPhrase AI</span><Link className="hover:text-primary" href="/legal">Privacy</Link><Link className="hover:text-primary" href="/legal">Terms</Link><Link className="hover:text-primary" href="/settings">Support</Link></div>
                <span>Built for clear, confident communication</span>
              </footer>
            ) : null}
              </>
            )}
          </>
        ) : null}

        {activeView === "history" ? (
          <div className="workspace-subview h-full overflow-y-auto px-4 py-6 md:px-10 md:py-10">
            <div className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-primary">History</h1>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Open a recent rewrite and continue from the composer.
                  </p>
                </div>
                <button
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
                  onClick={startNewRewrite}
                  type="button"
                >
                  New rewrite
                </button>
              </div>
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    className="workspace-list-card flex w-full items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-white px-5 py-4 text-left transition-colors hover:bg-surface-container-low"
                    key={thread.id}
                    onClick={() => openHistoryThread(thread)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary">
                        {thread.title || "Untitled rewrite"}
                      </span>
                      <span className="mt-1 block text-xs text-text-muted">
                        {thread.tone || "Rewrite"}
                      </span>
                    </span>
                    <Icon className="text-xl text-text-muted" name="edit" />
                  </button>
                ))}
                {!threads.length ? (
                  <div className="rounded-2xl border border-border-subtle bg-white px-5 py-8 text-center text-sm text-text-muted">
                    No rewrite history yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "templates" ? (
          <div className="workspace-subview h-full overflow-y-auto px-4 py-6 md:px-10 md:py-10">
            <div className="mx-auto max-w-4xl">
              <h1 className="text-3xl font-bold text-primary">Templates</h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Pick a starter and rewrite it in the workspace.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {templates.map((template) => (
                  <button
                    className="workspace-list-card rounded-2xl border border-border-subtle bg-white p-5 text-left transition-colors hover:bg-surface-container-low"
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    type="button"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {template.category}
                    </span>
                    <span className="block text-base font-semibold text-primary">
                      {template.title}
                    </span>
                    <span className="mt-3 block text-sm leading-6 text-text-muted">
                      {template.body}
                    </span>
                  </button>
                ))}
                {!templates.length ? (
                  <div className="rounded-2xl border border-border-subtle bg-white p-8 text-center text-sm text-text-muted sm:col-span-2">
                    Templates are loading.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
