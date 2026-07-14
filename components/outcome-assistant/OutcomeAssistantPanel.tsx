"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  lengthBucket,
  trackOutcomeEvent,
} from "@/lib/outcome-assistant/analytics";
import { extractLockedFactCandidates } from "@/lib/outcome-assistant/facts";
import { estimateCreditCost } from "@/lib/billing/credits";
import type { CreditBalance } from "@/lib/billing/types";
import type {
  CommunicationChannel,
  IntentType,
  OutcomeAssistantResponse,
  OutcomeVersion,
  RecipientType,
  RelationshipLevel,
  UrgencyLevel,
} from "@/lib/outcome-assistant/types";
import { trackPreferenceEvent } from "@/lib/preferences/analytics";
import type { UserPreferences } from "@/lib/preferences/registry";
import {
  channelLabels,
  channelOptions,
  intentLabels,
  intentOptions,
  recipientLabels,
  recipientOptions,
  relationshipLabels,
  relationshipOptions,
  riskLabels,
  urgencyLabels,
  urgencyOptions,
} from "@/lib/outcome-assistant/types";

type ApiErrorResponse = {
  message?: string;
  error?: string;
  usage?: {
    rewriteRemaining: number;
    rewriteLimit: number;
    isPro: boolean;
  };
  credits?: {
    charged: number;
    remaining: number;
    nextRefreshAt: string | null;
  };
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResult = ArrayLike<SpeechRecognitionAlternative> & {
  isFinal: boolean;
};

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResult>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

const minimumCharacters = 3;
const recommendedMaxCharacters = 3000;
const hardMaxCharacters = 5000;

const visibleOutputOrder = ["balanced", "safe", "firm"];

function getSpeechRecognition() {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function diffWords(original: string, updated: string) {
  const originalWords = original.trim().split(/\s+/).filter(Boolean);
  const updatedWords = updated.trim().split(/\s+/).filter(Boolean);
  const maxLength = Math.max(originalWords.length, updatedWords.length);

  return Array.from({ length: maxLength }, (_, index) => {
    const before = originalWords[index] ?? "";
    const after = updatedWords[index] ?? "";

    if (before === after) {
      return { type: "same" as const, value: after };
    }
    if (!before) return { type: "added" as const, value: after };
    if (!after) return { type: "removed" as const, value: before };
    return { type: "changed" as const, value: `${before} -> ${after}` };
  });
}

function highestSeverity(version: OutcomeVersion) {
  if (version.risks.some((risk) => risk.severity === "high")) return "high";
  if (
    version.risks.some((risk) => risk.severity === "medium") ||
    version.commitmentWarnings.length
  ) {
    return "medium";
  }
  return "low";
}

function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={
        selected
          ? "min-h-9 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white"
          : "min-h-9 rounded-full border border-border-subtle bg-white px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-container-low hover:text-primary"
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-text-muted">{children}</label>
  );
}

export function OutcomeAssistantPanel({
  plan = "free",
  planFeatureGatingEnabled = false,
  creditBillingEnabled = false,
  creditBalance = null,
  onCreditsChanged,
  preferences,
}: {
  plan?: "free" | "plus" | "pro";
  planFeatureGatingEnabled?: boolean;
  creditBillingEnabled?: boolean;
  creditBalance?: CreditBalance | null;
  onCreditsChanged?: (credits: {
    charged: number;
    remaining: number;
    nextRefreshAt: string | null;
  }) => void;
  preferences?: UserPreferences["outcomeAssistant"];
}) {
  const [originalText, setOriginalText] = useState("");
  const [recipient, setRecipient] = useState<RecipientType | "">("");
  const [customRecipient, setCustomRecipient] = useState("");
  const [intent, setIntent] = useState<IntentType | "">("");
  const [customIntent, setCustomIntent] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [relationshipLevel, setRelationshipLevel] = useState<RelationshipLevel>();
  const [urgency, setUrgency] = useState<UrgencyLevel>("none");
  const [desiredResponse, setDesiredResponse] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>(
    preferences?.defaultChannel && preferences.defaultChannel !== "auto"
      ? preferences.defaultChannel
      : "email",
  );
  const [languageMode, setLanguageMode] = useState<"standard" | "indian_workplace">(
    "standard",
  );
  const [lockedFacts, setLockedFacts] = useState<string[]>([]);
  const [manualFact, setManualFact] = useState("");
  const [response, setResponse] = useState<OutcomeAssistantResponse | null>(null);
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [selectedVersionId, setSelectedVersionId] = useState<string>(preferences?.defaultVariant ?? "balanced");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [intentSearch, setIntentSearch] = useState("");
  const [feedbackByVersion, setFeedbackByVersion] = useState<Record<string, string>>({});
  const [showComparison, setShowComparison] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Understanding your intention");
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "recording" | "unsupported" | "denied" | "processing"
  >("idle");
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(
    null,
  );

  const detectedFacts = useMemo(
    () => extractLockedFactCandidates(originalText),
    [originalText],
  );
  const selectedVersion = response?.variants.find(
    (version) => version.id === selectedVersionId,
  );
  const selectedMessage = selectedVersion
    ? editedMessages[selectedVersion.id] ?? selectedVersion.message
    : "";
  const creditEstimate = useMemo(() => {
    if (!creditBillingEnabled || !originalText.trim()) return null;
    try {
      return estimateCreditCost("outcome_assistant", originalText);
    } catch {
      return null;
    }
  }, [creditBillingEnabled, originalText]);
  const usedCredits = creditBalance
    ? Math.max(0, creditBalance.allowance - creditBalance.available)
    : 0;
  const favoriteRecipients = preferences?.favoriteRecipients ?? ["manager", "client", "colleague"];
  const favoriteIntents = preferences?.favoriteIntents ?? ["request", "follow_up", "approval", "status_update", "extension_request", "rejection"];
  const visibleRecipients = recipient && !favoriteRecipients.includes(recipient)
    ? [...favoriteRecipients, recipient]
    : favoriteRecipients;
  const visibleIntents = intent && !favoriteIntents.includes(intent)
    ? [...favoriteIntents, intent]
    : favoriteIntents;
  const searchedRecipients = recipientOptions.filter((option) =>
    recipientLabels[option].toLowerCase().includes(recipientSearch.trim().toLowerCase()),
  );
  const searchedIntents = intentOptions.filter((option) =>
    intentLabels[option].toLowerCase().includes(intentSearch.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!loading) return;

    const labels = [
      "Understanding your intention",
      "Checking important details",
      "Preparing three versions",
      "Reviewing communication risks",
    ];
    let index = 0;
    const interval = window.setInterval(() => {
      index = (index + 1) % labels.length;
      setLoadingLabel(labels[index]);
    }, 1400);

    return () => window.clearInterval(interval);
  }, [loading]);

  function toggleLockedFact(value: string) {
    setLockedFacts((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].slice(0, 30),
    );
  }

  function addManualFact() {
    const value = manualFact.trim();
    if (!value) return;
    setLockedFacts((current) =>
      current.some((item) => item.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value].slice(0, 30),
    );
    setManualFact("");
  }

  function validateForm() {
    if (originalText.trim().length < minimumCharacters) {
      return "Enter at least 3 characters.";
    }
    if (originalText.length > hardMaxCharacters) {
      return "Your message is over 5,000 characters. Shorten it before generating.";
    }
    if (!recipient) return "Choose who you are sending this to.";
    if (recipient === "other" && !customRecipient.trim()) {
      return "Describe the recipient.";
    }
    if (!intent) return "Choose what you want this message to achieve.";
    if (intent === "other" && !customIntent.trim()) {
      return "Describe the intended outcome.";
    }
    return "";
  }

  async function generate(nextText = originalText) {
    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (!recipient || !intent) return;

    setLoading(true);
    setError("");
    setStatus("");
    trackOutcomeEvent("outcome_generation_started", {
      recipient,
      intent,
      channel,
      inputLengthBucket: lengthBucket(nextText.length),
      lockedFactCount: lockedFacts.length,
      languageMode,
    });

    try {
      const startedAt = Date.now();
      const apiResponse = await fetch("/api/outcome-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          originalText: nextText,
          recipient,
          customRecipient,
          intent,
          customIntent,
          relationshipLevel,
          urgency,
          desiredResponse,
          channel,
          lockedFacts,
          languageMode,
        }),
      });
      const data = (await apiResponse.json().catch(() => null)) as
        | (OutcomeAssistantResponse & ApiErrorResponse)
        | null;

      if (!apiResponse.ok || !data) {
        throw new Error(data?.message || "Unable to prepare your message.");
      }

      setResponse(data);
      if (data.credits) onCreditsChanged?.(data.credits);
      setEditedMessages(
        Object.fromEntries(data.variants.map((version) => [version.id, version.message])),
      );
      setEditedIds(new Set());
      setSelectedVersionId(preferences?.defaultVariant ?? "balanced");
      setStatus("Three versions are ready.");
      trackOutcomeEvent("outcome_generation_succeeded", {
        recipient,
        intent,
        channel,
        inputLengthBucket: lengthBucket(nextText.length),
        lockedFactCount: lockedFacts.length,
        riskCount: data.variants.reduce(
          (count, version) => count + version.risks.length,
          0,
        ),
        generationDurationMs: Date.now() - startedAt,
        languageMode,
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "We could not prepare your message because the connection was interrupted. Please try again.";
      setError(message);
      trackOutcomeEvent("outcome_generation_failed", {
        recipient,
        intent,
        channel,
        errorCategory: "request_failed",
        languageMode,
      });
    } finally {
      setLoading(false);
    }
  }

  function startVoiceInput() {
    if (typeof window === "undefined") return;
    if (planFeatureGatingEnabled && plan === "free") {
      setError("Voice input is available on Plus and Pro.");
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceStatus("unsupported");
      setError("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognitionRef.current = recognition;
    let finalTranscript = "";

    recognition.onstart = () => {
      setVoiceStatus("recording");
      setError("");
      trackOutcomeEvent("outcome_voice_started");
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript ?? "";
        if (event.results[index]?.isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      const next = `${finalTranscript}${interim}`.trim();
      if (next) setOriginalText(next);
    };
    recognition.onerror = (event) => {
      setVoiceStatus(event.error === "not-allowed" ? "denied" : "idle");
      setError(
        event.error === "not-allowed"
          ? "Microphone permission was denied."
          : "Voice input stopped. Please try again.",
      );
    };
    recognition.onend = () => {
      setVoiceStatus("idle");
      trackOutcomeEvent("outcome_voice_completed", {
        inputLengthBucket: lengthBucket(originalText.length),
      });
    };
    recognition.start();
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop();
    setVoiceStatus("processing");
  }

  async function copyVersion(version: OutcomeVersion) {
    const message = editedMessages[version.id] ?? version.message;
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Copied");
      trackOutcomeEvent("outcome_variant_copied", {
        selectedVariant: version.id,
        outputLengthBucket: lengthBucket(message.length),
        highestRiskSeverity: highestSeverity(version),
      });
    } catch {
      setStatus("Copy failed. Select the message and copy it manually.");
    }
  }

  function updateEditedMessage(id: string, value: string) {
    setEditedMessages((current) => ({ ...current, [id]: value }));
    setEditedIds((current) => new Set(current).add(id));
    trackOutcomeEvent("outcome_variant_edited", { selectedVariant: id });
  }

  const orderedVariants = response
    ? [...response.variants].sort(
        (a, b) =>
          visibleOutputOrder.indexOf(a.id) - visibleOutputOrder.indexOf(b.id),
      )
    : [];

  return (
    <div className="h-full overflow-y-auto px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-3xl font-semibold text-primary md:text-[34px] md:leading-10">
            Say it the right way
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-muted">
            Tell ProPhrase what you want to say, who you are speaking to and what you need.
          </p>
        </header>

        <section className="rounded-3xl border border-border-subtle bg-white p-5 shadow-sm md:p-10">
          <div className="grid gap-7">
            <div className="grid gap-2">
              <FieldLabel>What do you want to say?</FieldLabel>
              <div className="relative">
              <textarea
                aria-describedby="outcome-character-count"
                className="min-h-40 w-full resize-y rounded-xl border border-border-subtle bg-surface-container-low px-5 py-4 pb-9 text-base leading-6 text-primary outline-none transition-colors focus:border-primary"
                maxLength={hardMaxCharacters + 1}
                onChange={(event) => setOriginalText(event.target.value)}
                placeholder="Draft your thought or intent here..."
                value={originalText}
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-3">
                <p
                  className={
                    originalText.length > hardMaxCharacters
                      ? "text-xs font-semibold text-red-700"
                      : originalText.length > recommendedMaxCharacters
                        ? "text-xs font-semibold text-amber-700"
                        : "text-xs text-text-muted"
                  }
                  id="outcome-character-count"
                >
                  {originalText.length} / {hardMaxCharacters}
                </p>
                <div className="hidden gap-2 sm:flex">
                  {voiceStatus === "recording" ? (
                    <button
                      className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-primary"
                      onClick={stopVoiceInput}
                      type="button"
                    >
                      Stop recording
                    </button>
                  ) : (
                    <button
                      className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-primary"
                      onClick={startVoiceInput}
                      type="button"
                    >
                      Start voice input
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>

            <div className="grid gap-7">
              <div className="grid gap-3">
                <FieldLabel>Who are you sending this to?</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {visibleRecipients.map((option) => (
                    <Chip
                      key={option}
                      selected={recipient === option}
                      onClick={() => {
                        setRecipient(option);
                        trackPreferenceEvent("outcome_favorite_recipient_selected", { recipientCategory: option, source: "workspace" });
                      }}
                    >
                      {recipientLabels[option]}
                    </Chip>
                  ))}
                  <details className="relative">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-full border border-dashed border-border-subtle bg-white px-4 text-xs font-semibold text-text-muted" onClick={() => trackPreferenceEvent("outcome_more_recipient_opened", { source: "workspace" })}>More</summary>
                    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border border-border-subtle bg-white p-4 shadow-2xl md:absolute md:inset-auto md:left-0 md:top-11 md:w-72 md:rounded-lg">
                      <label className="grid gap-2 text-xs font-semibold text-text-muted">Find recipient<input className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-primary" onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search recipients" value={recipientSearch} /></label>
                      <div className="mt-3 grid gap-1">{searchedRecipients.map((option) => <button className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold hover:bg-surface-container-low" key={option} onClick={(event) => { setRecipient(option); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} type="button">{recipientLabels[option]}</button>)}</div>
                    </div>
                  </details>
                </div>
                {recipient === "other" ? (
                  <input
                    className="rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-sm text-primary outline-none focus:border-accent-warm"
                    maxLength={80}
                    onChange={(event) => setCustomRecipient(event.target.value)}
                    placeholder="Describe the recipient"
                    value={customRecipient}
                  />
                ) : null}
              </div>

              <div className="grid gap-3">
                <FieldLabel>What do you want this message to achieve?</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {visibleIntents.map((option) => (
                    <Chip
                      key={option}
                      selected={intent === option}
                      onClick={() => {
                        setIntent(option);
                        trackPreferenceEvent("outcome_favorite_intent_selected", { intentCategory: option, source: "workspace" });
                      }}
                    >
                      {intentLabels[option]}
                    </Chip>
                  ))}
                  <details className="relative">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-full border border-dashed border-border-subtle bg-white px-4 text-xs font-semibold text-text-muted" onClick={() => trackPreferenceEvent("outcome_more_intent_opened", { source: "workspace" })}>More</summary>
                    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border border-border-subtle bg-white p-4 shadow-2xl md:absolute md:inset-auto md:right-0 md:top-11 md:w-80 md:rounded-lg">
                      <label className="grid gap-2 text-xs font-semibold text-text-muted">Find goal<input className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-primary" onChange={(event) => setIntentSearch(event.target.value)} placeholder="Search goals" value={intentSearch} /></label>
                      <div className="mt-3 grid gap-1">{searchedIntents.map((option) => <button className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold hover:bg-surface-container-low" key={option} onClick={(event) => { setIntent(option); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} type="button">{intentLabels[option]}</button>)}</div>
                    </div>
                  </details>
                </div>
                {intent === "other" ? (
                  <input
                    className="rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-sm text-primary outline-none focus:border-accent-warm"
                    maxLength={120}
                    onChange={(event) => setCustomIntent(event.target.value)}
                    placeholder="Describe the intended outcome"
                    value={customIntent}
                  />
                ) : null}
              </div>
            </div>

            <div className={contextOpen ? "order-5 rounded-xl border border-border-subtle bg-surface-container-low p-4" : "hidden"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <FieldLabel>Protect important details</FieldLabel>
                  <p className="mt-1 text-sm leading-5 text-text-muted">
                    Names, dates, amounts and technical terms listed here will not be
                    changed.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {detectedFacts.map((fact) => (
                  <Chip
                    key={fact}
                    selected={lockedFacts.includes(fact)}
                    onClick={() => toggleLockedFact(fact)}
                  >
                    {fact}
                  </Chip>
                ))}
                {!detectedFacts.length ? (
                  <p className="text-sm text-text-muted">
                    Possible protected details will appear here as you type.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-border-subtle bg-white px-4 py-3 text-sm text-primary outline-none focus:border-accent-warm"
                  maxLength={120}
                  onChange={(event) => setManualFact(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addManualFact();
                    }
                  }}
                  placeholder="Add something the AI must not change"
                  value={manualFact}
                />
                <button
                  className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
                  onClick={addManualFact}
                  type="button"
                >
                  Add detail
                </button>
              </div>
              {lockedFacts.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lockedFacts.map((fact) => (
                    <button
                      className="rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white"
                      key={fact}
                      onClick={() => toggleLockedFact(fact)}
                      type="button"
                    >
                      {fact} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              className="order-4 flex min-h-14 items-center justify-between rounded-xl border border-border-subtle bg-surface-container-low px-5 py-3 text-left text-sm font-semibold text-primary"
              onClick={() => setContextOpen((open) => !open)}
              type="button"
            >
              <span>Add helpful details</span><span aria-hidden="true">{contextOpen ? "−" : "+"}</span>
            </button>
            {contextOpen ? (
              <div className="order-6 grid gap-4 rounded-xl border border-border-subtle bg-surface p-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-primary">
                    Relationship level
                  </span>
                  <select
                    className="rounded-xl border border-border-subtle bg-white px-3 py-3 text-sm"
                    onChange={(event) =>
                      setRelationshipLevel(
                        event.target.value as RelationshipLevel | undefined,
                      )
                    }
                    value={relationshipLevel ?? ""}
                  >
                    <option value="">Not specified</option>
                    {relationshipOptions.map((option) => (
                      <option key={option} value={option}>
                        {relationshipLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-primary">Urgency</span>
                  <select
                    className="rounded-xl border border-border-subtle bg-white px-3 py-3 text-sm"
                    onChange={(event) => setUrgency(event.target.value as UrgencyLevel)}
                    value={urgency}
                  >
                    {urgencyOptions.map((option) => (
                      <option key={option} value={option}>
                        {urgencyLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-primary">
                    What response do you want from them?
                  </span>
                  <input
                    className="rounded-xl border border-border-subtle bg-white px-3 py-3 text-sm"
                    maxLength={150}
                    onChange={(event) => setDesiredResponse(event.target.value)}
                    placeholder="Approve the request"
                    value={desiredResponse}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-primary">
                    Communication channel
                  </span>
                  <select
                    className="rounded-xl border border-border-subtle bg-white px-3 py-3 text-sm"
                    onChange={(event) =>
                      setChannel(event.target.value as CommunicationChannel)
                    }
                    value={channel}
                  >
                    {channelOptions.map((option) => (
                      <option key={option} value={option}>
                        {channelLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-white p-3 md:col-span-2">
                  <input
                    checked={languageMode === "indian_workplace"}
                    className="mt-1"
                    onChange={(event) =>
                      setLanguageMode(
                        event.target.checked ? "indian_workplace" : "standard",
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-primary">
                      Natural Indian workplace English
                    </span>
                    <span className="block text-sm leading-5 text-text-muted">
                      Understands Indian English and Hinglish while producing natural
                      professional English.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            {error ? (
              <p className="order-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {status ? (
              <p aria-live="polite" className="order-7 text-center text-sm font-semibold text-text-muted">
                {status}
              </p>
            ) : null}

            <button
              className="order-8 mx-auto flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60"
              disabled={loading}
              onClick={() => void generate()}
              type="button"
            >
              {loading ? loadingLabel : "Prepare my message"}<span aria-hidden="true">✦</span>
            </button>
            <p className="order-9 text-center text-[11px] text-text-muted">Powered by ProPhrase Intelligence</p>
          </div>
        </section>

        <div className="grid gap-4 pb-6 md:grid-cols-3">
          <div className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-white p-5 shadow-sm md:col-span-2">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#fff3d6] text-xl">✦</span>
            <div><p className="text-sm font-bold text-primary">Pro-Tip: Context matters</p><p className="mt-1 text-sm leading-5 text-text-muted">Including a project name or deadline helps ProPhrase provide a more precise message.</p></div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-white p-5 text-center shadow-sm">
            <span className="text-2xl font-bold text-primary">{creditBillingEnabled && creditBalance ? creditBalance.available : response ? response.variants.length : "Ready"}</span>
            <span className="mt-1 text-xs text-text-muted">{creditBillingEnabled && creditBalance ? `${usedCredits} used${creditEstimate ? ` · ~${creditEstimate.creditCost} next` : ""}` : "Message assistant"}</span>
          </div>
        </div>

        {response ? (
          <section className="grid gap-5">
            <div>
              <h2 className="text-2xl font-bold text-primary">
                Choose the version that fits
              </h2>
              {response.understoodIntent ? (
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  Understood intent: {response.understoodIntent}
                </p>
              ) : null}
            </div>

            {response.missingInformation?.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  Information that may improve this message
                </p>
                <ul className="mt-2 list-inside list-disc text-sm leading-6 text-amber-900">
                  {response.missingInformation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-3">
              {orderedVariants.map((version) => {
                const message = editedMessages[version.id] ?? version.message;
                const visibleRisks = version.risks.filter(
                  (risk) => risk.severity !== "low",
                );
                const lowRisks = version.risks.filter(
                  (risk) => risk.severity === "low",
                );
                const hasFactWarning = version.factVerification.some(
                  (fact) => fact.status !== "preserved",
                );

                return (
                  <article
                    className={
                      version.id === "balanced"
                        ? "rounded-3xl border-2 border-primary bg-white p-5 shadow-lg"
                        : "rounded-3xl border border-border-subtle bg-white p-5 shadow-sm"
                    }
                    key={version.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold text-primary">
                          {version.label}
                        </h3>
                        <p className="mt-1 text-sm leading-5 text-text-muted">
                          {version.explanation}
                        </p>
                      </div>
                      {version.id === "balanced" ? (
                        <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                          Recommended
                        </span>
                      ) : null}
                    </div>

                    <textarea
                      className="mt-4 min-h-44 w-full resize-y rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-sm leading-6 text-primary outline-none focus:border-accent-warm"
                      onChange={(event) =>
                        updateEditedMessage(version.id, event.target.value)
                      }
                      value={message}
                    />
                    {editedIds.has(version.id) ? (
                      <p className="mt-2 text-xs font-semibold text-text-muted">
                        Edited
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white"
                        onClick={() => void copyVersion(version)}
                        type="button"
                      >
                        Copy
                      </button>
                      <button
                        className="rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-primary"
                        onClick={() => {
                          setSelectedVersionId(version.id);
                          setStatus("Version selected.");
                          trackOutcomeEvent("outcome_variant_selected", {
                            selectedVariant: version.id,
                          });
                        }}
                        type="button"
                      >
                        Use this version
                      </button>
                      <button
                        className="rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-primary"
                        disabled={loading}
                        onClick={() => void generate()}
                        type="button"
                      >
                        Regenerate
                      </button>
                      {editedIds.has(version.id) ? (
                        <button
                          className="rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-primary"
                          disabled={loading}
                          onClick={() => void generate(message)}
                          type="button"
                        >
                          Check edited message
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 rounded-2xl bg-surface-container-low p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        How it may be received
                      </p>
                      <p className="mt-1 text-sm leading-5 text-primary">
                        {version.readerInterpretation}
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {hasFactWarning ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                          Protected detail warning: review this version before sending.
                        </p>
                      ) : (
                        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                          Protected details preserved
                        </p>
                      )}
                      {version.commitmentWarnings.map((warning) => (
                        <p
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                          key={`${version.id}-${warning.type}-${warning.evidence}`}
                        >
                          {warning.explanation}
                        </p>
                      ))}
                      {visibleRisks.slice(0, 5).map((risk) => (
                        <div
                          className="rounded-xl border border-border-subtle bg-surface px-3 py-2"
                          key={`${version.id}-${risk.type}-${risk.evidence}`}
                        >
                          <p className="text-sm font-semibold text-primary">
                            {riskLabels[risk.type]} ({risk.severity})
                          </p>
                          <p className="mt-1 text-sm leading-5 text-text-muted">
                            {risk.explanation}
                          </p>
                        </div>
                      ))}
                      {lowRisks.length ? (
                        <details className="rounded-xl border border-border-subtle bg-surface px-3 py-2">
                          <summary className="cursor-pointer text-sm font-semibold text-primary">
                            More details
                          </summary>
                          <div className="mt-2 space-y-2">
                            {lowRisks.map((risk) => (
                              <p
                                className="text-sm leading-5 text-text-muted"
                                key={`${version.id}-${risk.type}-${risk.evidence}`}
                              >
                                {riskLabels[risk.type]}: {risk.explanation}
                              </p>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>

                    <div className="mt-4 rounded-2xl border border-border-subtle p-3">
                      <p className="text-sm font-semibold text-primary">
                        Did this message express what you wanted?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {["Yes", "Partly", "No"].map((choice) => (
                          <button
                            className={
                              feedbackByVersion[version.id] === choice
                                ? "rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white"
                                : "rounded-full border border-border-subtle px-3 py-2 text-xs font-semibold text-primary"
                            }
                            key={choice}
                            onClick={() =>
                              setFeedbackByVersion((current) => ({
                                ...current,
                                [version.id]: choice,
                              }))
                            }
                            type="button"
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {selectedVersion ? (
              <div className="rounded-3xl border border-border-subtle bg-white p-5">
                <button
                  className="rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold text-primary"
                  onClick={() => setShowComparison((show) => !show)}
                  type="button"
                >
                  See what changed
                </button>
                {showComparison ? (
                  <div className="mt-4 grid gap-3 text-sm leading-6">
                    {diffWords(originalText, selectedMessage).map((part, index) => (
                      <span
                        className={
                          part.type === "added"
                            ? "rounded-lg bg-green-50 px-2 py-1 text-green-800"
                            : part.type === "removed"
                              ? "rounded-lg bg-red-50 px-2 py-1 text-red-800"
                              : part.type === "changed"
                                ? "rounded-lg bg-amber-50 px-2 py-1 text-amber-900"
                                : "px-2 py-1 text-text-muted"
                        }
                        key={`${part.type}-${index}`}
                      >
                        {part.type === "same"
                          ? part.value
                          : `${part.type === "added" ? "Added" : part.type === "removed" ? "Removed" : "Changed"}: ${part.value}`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
