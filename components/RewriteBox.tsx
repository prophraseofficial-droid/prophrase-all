"use client";

import { useEffect, useState } from "react";
import { HistoryList } from "@/components/HistoryList";
import { OutputBox } from "@/components/OutputBox";
import { ToneSelector } from "@/components/ToneSelector";
import type { Tone } from "@/lib/tones";
import { isTone } from "@/lib/tones";
import {
  type HistoryItem,
  readHistory,
  saveHistoryItem,
} from "@/lib/storage";

const MAX_INPUT_LENGTH = 2000;

export function RewriteBox() {
  const [inputText, setInputText] = useState("");
  const [selectedTone, setSelectedTone] = useState<Tone>("Professional");
  const [outputText, setOutputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    window.queueMicrotask(() => {
      setHistory(readHistory());
    });
  }, []);

  async function handleRewrite() {
    const trimmedText = inputText.trim();
    setError("");

    if (!trimmedText) {
      setError("Please enter a message to rewrite.");
      return;
    }

    if (trimmedText.length < 3) {
      setError("Message is too short to rewrite.");
      return;
    }

    if (trimmedText.length > MAX_INPUT_LENGTH) {
      setError("Please keep your message under 2000 characters.");
      return;
    }

    if (!isTone(selectedTone)) {
      setError("Please select a valid tone.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedText,
          tone: selectedTone,
        }),
      });

      const data = (await response.json()) as { result?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      if (!data.result?.trim()) {
        throw new Error("No rewritten message was generated. Please try again.");
      }

      setOutputText(data.result);
      setHistory(
        saveHistoryItem({
          input: trimmedText,
          tone: selectedTone,
          output: data.result,
        }),
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof TypeError
          ? "Please check your connection and try again."
          : caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.04fr_0.96fr]">
      <section className="rounded-lg border border-border bg-card p-5 shadow-[0_24px_80px_rgba(17,17,17,0.06)]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Rewrite your message
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Paste a rough work message, choose a tone, and copy the polished
              reply.
            </p>
          </div>
          <p className="text-sm tabular-nums text-muted">
            {inputText.length}/{MAX_INPUT_LENGTH}
          </p>
        </div>

        <textarea
          value={inputText}
          maxLength={MAX_INPUT_LENGTH}
          onChange={(event) => setInputText(event.target.value)}
          placeholder="Paste your rough work message here..."
          className="min-h-56 w-full resize-y rounded-lg border border-border bg-[#fbfaf7] p-4 leading-7 text-foreground placeholder:text-muted"
        />

        <div className="mt-5">
          <ToneSelector selectedTone={selectedTone} onChange={setSelectedTone} />
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleRewrite}
          disabled={isLoading}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-70"
        >
          {isLoading ? "Polishing your message..." : "Rewrite Message"}
        </button>
      </section>

      <div className="grid gap-5">
        <OutputBox outputText={outputText} />
        <HistoryList history={history} onClear={() => setHistory([])} />
      </div>
    </div>
  );
}
