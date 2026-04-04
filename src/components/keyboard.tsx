"use client";

import type { LetterResult } from "@/types";
import { cn } from "@/lib/utils";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["Enter", "z", "x", "c", "v", "b", "n", "m", "⌫"],
];

type KeyboardProps = {
  keyColors: Record<string, LetterResult>;
  onKey: (key: string) => void;
  disabled?: boolean;
};

export function Keyboard({ keyColors, onKey, disabled }: KeyboardProps) {
  return (
    <div className="flex flex-col gap-1.5 items-center" role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className="flex gap-1">
          {row.map((key) => {
            const color = keyColors[key];
            const isWide = key === "Enter" || key === "⌫";
            return (
              <button
                key={key}
                onClick={() => onKey(key)}
                disabled={disabled}
                className={cn(
                  "h-14 rounded-md font-semibold uppercase text-sm select-none",
                  "transition-colors duration-150",
                  "active:scale-95 disabled:opacity-50",
                  isWide ? "px-3 min-w-[65px]" : "w-9 sm:w-10",
                  color === "correct" && "bg-green-600 text-white",
                  color === "present" && "bg-yellow-500 text-white",
                  color === "absent" && "bg-zinc-800 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-700 opacity-60",
                  !color && "bg-zinc-200 dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100",
                )}
                aria-label={key === "⌫" ? "Backspace" : key}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
