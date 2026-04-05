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
    <div
      className="flex-1 flex items-center justify-center w-full"
      style={{ maxHeight: "calc(6 * (68px + 6px))" }}
    >
      {/*
        Grid uses CSS container query sizing:
        - Each tile is sized with aspect-ratio: 1
        - The grid fills available height, capped at max-height
      */}
      <div
        className="grid gap-[5px] sm:gap-1.5 w-full h-full"
        style={{
          gridTemplateRows: `repeat(${MAX_GUESSES}, 1fr)`,
          gridTemplateColumns: `repeat(${WORD_LENGTH}, 1fr)`,
          maxWidth: "min(350px, calc((100vh - 220px) / 6 * 5))",
          maxHeight: "min(420px, 100%)",
        }}
        role="grid"
        aria-label="Game board"
      >
        {/* Completed guesses */}
        {guessResults.map((gr, rowIdx) =>
          gr.guess.split("").map((letter, colIdx) => (
            <Tile
              key={`${rowIdx}-${colIdx}`}
              letter={letter}
              result={gr.results[colIdx]}
              delay={colIdx * 100}
              revealed
            />
          ))
        )}

        {/* Current guess row */}
        {!gameOver &&
          Array.from({ length: WORD_LENGTH }).map((_, colIdx) => (
            <Tile
              key={`current-${colIdx}`}
              letter={currentGuess[colIdx] || ""}
              active={colIdx === currentGuess.length}
            />
          ))}

        {/* Empty rows */}
        {Array.from({ length: Math.max(0, emptyRows) * WORD_LENGTH }).map((_, i) => (
          <Tile key={`empty-${i}`} letter="" />
        ))}
      </div>
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
        "aspect-square w-full max-w-[68px] flex items-center justify-center font-bold uppercase border-2 rounded-md select-none",
        "text-[clamp(1.25rem,4vw,2rem)]",
        "transition-all duration-500 mx-auto",
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
