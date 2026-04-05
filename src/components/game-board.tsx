"use client";

import { useState, useEffect, useRef } from "react";
import type { GuessResult } from "@/types";
import { cn } from "@/lib/utils";

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;
const FLIP_DURATION = 500; // ms per tile flip
const FLIP_STAGGER = 350; // ms between each tile

type GameBoardProps = {
  guessResults: GuessResult[];
  currentGuess: string;
  gameOver: boolean;
};

export function GameBoard({ guessResults, currentGuess, gameOver }: GameBoardProps) {
  const emptyRows = MAX_GUESSES - guessResults.length - (gameOver ? 0 : 1);
  const [revealedRows, setRevealedRows] = useState(guessResults.length);
  const prevLengthRef = useRef(guessResults.length);

  // When a new guess is added, animate it
  useEffect(() => {
    if (guessResults.length > prevLengthRef.current) {
      // New row added — start reveal animation
      const newRowIdx = guessResults.length - 1;
      setRevealedRows(newRowIdx); // Don't reveal the new row yet

      // Reveal each tile with stagger
      const timeout = setTimeout(() => {
        setRevealedRows(guessResults.length);
      }, FLIP_STAGGER * WORD_LENGTH + FLIP_DURATION);

      prevLengthRef.current = guessResults.length;
      return () => clearTimeout(timeout);
    }
    // On initial load, all rows are revealed
    prevLengthRef.current = guessResults.length;
    setRevealedRows(guessResults.length);
  }, [guessResults.length]);

  return (
    <div
      className="flex-1 flex items-center justify-center w-full"
      style={{ maxHeight: "calc(6 * (68px + 6px))" }}
    >
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
        {guessResults.map((gr, rowIdx) => {
          const isRevealing = rowIdx >= revealedRows;
          return gr.guess.split("").map((letter, colIdx) => (
            <FlipTile
              key={`${rowIdx}-${colIdx}`}
              letter={letter}
              result={gr.results[colIdx]}
              flipped={!isRevealing}
              delay={isRevealing ? colIdx * FLIP_STAGGER : 0}
              animating={isRevealing}
            />
          ));
        })}

        {/* Current guess row */}
        {!gameOver &&
          Array.from({ length: WORD_LENGTH }).map((_, colIdx) => {
            const letter = currentGuess[colIdx] || "";
            const justTyped = colIdx === currentGuess.length - 1;
            return (
              <div
                key={`current-${colIdx}`}
                className={cn(
                  "aspect-square w-full max-w-[68px] flex items-center justify-center font-bold uppercase border-2 rounded-md select-none mx-auto",
                  "text-[clamp(1.25rem,4vw,2rem)]",
                  letter && "border-zinc-400 dark:border-zinc-500",
                  !letter && "border-zinc-300 dark:border-zinc-700",
                  colIdx === currentGuess.length && "border-zinc-500 dark:border-zinc-400",
                  justTyped && "animate-pop",
                )}
                role="gridcell"
                aria-label={letter || "empty"}
              >
                {letter}
              </div>
            );
          })}

        {/* Empty rows */}
        {Array.from({ length: Math.max(0, emptyRows) * WORD_LENGTH }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-square w-full max-w-[68px] flex items-center justify-center font-bold uppercase border-2 rounded-md select-none mx-auto border-zinc-300 dark:border-zinc-700"
            role="gridcell"
            aria-label="empty"
          />
        ))}
      </div>
    </div>
  );
}

type FlipTileProps = {
  letter: string;
  result: "correct" | "present" | "absent";
  flipped: boolean;
  delay: number;
  animating: boolean;
};

function FlipTile({ letter, result, flipped, delay, animating }: FlipTileProps) {
  const [showColor, setShowColor] = useState(flipped && !animating);

  useEffect(() => {
    if (animating) {
      // Show color halfway through the flip
      const timeout = setTimeout(() => {
        setShowColor(true);
      }, delay + FLIP_DURATION / 2);
      return () => clearTimeout(timeout);
    } else {
      setShowColor(true);
    }
  }, [animating, delay]);

  const colorClasses = showColor
    ? result === "correct" ? "bg-green-600 border-green-600 text-white"
      : result === "present" ? "bg-yellow-500 border-yellow-500 text-white"
      : "bg-zinc-600 border-zinc-600 text-white"
    : "border-zinc-400 dark:border-zinc-500";

  return (
    <div
      className={cn(
        "aspect-square w-full max-w-[68px] flex items-center justify-center font-bold uppercase border-2 rounded-md select-none mx-auto",
        "text-[clamp(1.25rem,4vw,2rem)]",
        colorClasses,
      )}
      style={animating ? {
        animation: `flip ${FLIP_DURATION}ms ease-in-out ${delay}ms both`,
      } : undefined}
      role="gridcell"
      aria-label={`${letter}, ${result}`}
    >
      {letter}
    </div>
  );
}
