import type { Tone } from "@/lib/tones";

export const HISTORY_KEY = "prophrase_history";
export const HISTORY_LIMIT = 5;

export type HistoryItem = {
  id: string;
  input: string;
  tone: Tone;
  output: string;
  createdAt: string;
};

export function readHistory(): HistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawHistory = window.localStorage.getItem(HISTORY_KEY);
    if (!rawHistory) {
      return [];
    }

    const parsed = JSON.parse(rawHistory);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(items.slice(0, HISTORY_LIMIT)),
  );
}

export function saveHistoryItem(item: Omit<HistoryItem, "id" | "createdAt">) {
  const nextItem: HistoryItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const nextHistory = [nextItem, ...readHistory()].slice(0, HISTORY_LIMIT);
  writeHistory(nextHistory);
  return nextHistory;
}

export function clearHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(HISTORY_KEY);
}
