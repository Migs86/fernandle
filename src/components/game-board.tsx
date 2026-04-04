"use client";

import type { GuessResult } from "@/types";
import { cn } from "@/lib/utils";

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;

type GameBoardProps = {
  guessResults: GuessResult[];
  currentGuess: string;
  gameOver: boolean;
};

export function GameBoard({ guessResults, currentGuess, gameOver }: GameBoardProps) {
  const emptyRows = MAX_GUESSES - guessResults.length - (gameOver ? 0 : 1);

  return (
    <div className="grid gap-1.5" role="grid" aria-label="Game board">
      {/* Completed guesses */}
      {guessResults.map((gr, rowIdx) => (
        <div key={rowIdx} className="flex gap-1.5 justify-center" role="row">
          {gr.guess.split("").map((letter, colIdx) => (
            <Tile
              key={colIdx}
              letter={letter}
              result={gr.results[colIdx]}
              delay={colIdx * 100}
              revealed
            />
          ))}
        </div>
      ))}

      {/* Current guess row */}
      {!gameOver && (
        <div className="flex gap-1.5 justify-center" role="row">
          {Array.from({ length: WORD_LENGTH }).map((_, colIdx) => (
            <Tile
              key={colIdx}
              letter={currentGuess[colIdx] || ""}
              active={colIdx === currentGuess.length}
            />
          ))}
        </div>
      )}

      {/* Empty rows */}
      {Array.from({ length: Math.max(0, emptyRows) }).map((_, rowIdx) => (
        <div key={`empty-${rowIdx}`} className="flex gap-1.5 justify-center" role="row">
          {Array.from({ length: WORD_LENGTH }).map((_, colIdx) => (
            <Tile key={colIdx} letter="" />
          ))}
        </div>
      ))}
    </div>
  );
}

type TileProps = {
  letter: string;
  result?: "correct" | "present" | "absent";
  revealed?: boolean;
  active?: boolean;
  delay?: number;
};

function Tile({ letter, result, revealed, active, delay = 0 }: TileProps) {
  return (
    <div
      className={cn(
        "w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-2xl font-bold uppercase border-2 rounded-md select-none",
        "transition-all duration-500",
        revealed && result === "correct" && "bg-green-600 border-green-600 text-white",
        revealed && result === "present" && "bg-yellow-500 border-yellow-500 text-white",
        revealed && result === "absent" && "bg-zinc-600 border-zinc-600 text-white",
        !revealed && letter && "border-zinc-400 dark:border-zinc-500",
        !revealed && !letter && "border-zinc-300 dark:border-zinc-700",
        active && "border-zinc-500 dark:border-zinc-400",
      )}
      style={revealed ? { animationDelay: `${delay}ms` } : undefined}
      role="gridcell"
      aria-label={letter ? `${letter}${result ? `, ${result}` : ""}` : "empty"}
    >
      {letter}
    </div>
  );
}
