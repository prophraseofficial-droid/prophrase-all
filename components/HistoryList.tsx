"use client";

import type { HistoryItem } from "@/lib/storage";
import { clearHistory } from "@/lib/storage";

type HistoryListProps = {
  history: HistoryItem[];
  onClear: () => void;
};

export function HistoryList({ history, onClear }: HistoryListProps) {
  async function copyOutput(output: string) {
    await navigator.clipboard.writeText(output);
  }

  function handleClear() {
    clearHistory();
    onClear();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Recent history</h2>
        <button
          type="button"
          onClick={handleClear}
          disabled={history.length === 0}
          className="min-h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          Clear History
        </button>
      </div>

      {history.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-[#fbfaf7] p-4 text-sm leading-6 text-muted">
          Your recent rewrites will appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => copyOutput(item.output)}
              className="block w-full rounded-lg border border-border bg-white p-4 text-left transition hover:border-accent"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full border border-border px-2.5 py-1 font-medium text-foreground">
                  {item.tone}
                </span>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-muted">
                {item.input}
              </p>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground">
                {item.output}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
