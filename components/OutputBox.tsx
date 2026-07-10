"use client";

import { useState } from "react";

type OutputBoxProps = {
  outputText: string;
};

export function OutputBox({ outputText }: OutputBoxProps) {
  const [copied, setCopied] = useState(false);
  const hasOutput = outputText.trim().length > 0;

  async function handleCopy() {
    if (!hasOutput) {
      return;
    }

    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Polished message</h2>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasOutput}
          className="min-h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div
        className={`min-h-44 whitespace-pre-wrap rounded-lg border border-border p-4 leading-7 ${
          hasOutput ? "bg-success text-foreground" : "bg-[#fbfaf7] text-muted"
        }`}
      >
        {hasOutput ? outputText : "Your polished message will appear here."}
      </div>
    </section>
  );
}
