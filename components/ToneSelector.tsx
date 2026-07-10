"use client";

import type { Tone } from "@/lib/tones";
import { tones } from "@/lib/tones";

type ToneSelectorProps = {
  selectedTone: Tone;
  onChange: (tone: Tone) => void;
};

export function ToneSelector({ selectedTone, onChange }: ToneSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tone">
      {tones.map((tone) => {
        const isSelected = selectedTone === tone;

        return (
          <button
            key={tone}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(tone)}
            className={`min-h-10 rounded-lg border px-4 text-sm font-medium transition ${
              isSelected
                ? "border-accent bg-accent text-white"
                : "border-border bg-white text-foreground hover:border-accent"
            }`}
          >
            {tone}
          </button>
        );
      })}
    </div>
  );
}
