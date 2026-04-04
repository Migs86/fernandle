import type { LetterResult } from "@/types";

/**
 * Two-pass evaluation that correctly handles duplicate letters.
 *
 * Pass 1: Mark exact matches (green/correct)
 * Pass 2: For remaining letters, check if present elsewhere (yellow/present)
 */
export function evaluateGuess(guess: string, answer: string): LetterResult[] {
  const results: LetterResult[] = Array(5).fill("absent");
  const answerLetters = answer.split("");
  const guessLetters = guess.split("");

  // Track which answer positions are consumed
  const consumed = Array(5).fill(false);

  // Pass 1: exact matches
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      results[i] = "correct";
      consumed[i] = true;
    }
  }

  // Pass 2: present but wrong position
  for (let i = 0; i < 5; i++) {
    if (results[i] === "correct") continue;
    for (let j = 0; j < 5; j++) {
      if (!consumed[j] && guessLetters[i] === answerLetters[j]) {
        results[i] = "present";
        consumed[j] = true;
        break;
      }
    }
  }

  return results;
}

/**
 * Build a keyboard color map from all guesses so far.
 * Priority: correct > present > absent
 */
export function buildKeyboardColors(
  guessResults: { guess: string; results: LetterResult[] }[]
): Record<string, LetterResult> {
  const colors: Record<string, LetterResult> = {};
  const priority: Record<LetterResult, number> = {
    correct: 3,
    present: 2,
    absent: 1,
  };

  for (const { guess, results } of guessResults) {
    for (let i = 0; i < 5; i++) {
      const letter = guess[i];
      const current = colors[letter];
      if (!current || priority[results[i]] > priority[current]) {
        colors[letter] = results[i];
      }
    }
  }

  return colors;
}
