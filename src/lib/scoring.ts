const BASE_POINTS: Record<number, number> = {
  1: 50,
  2: 35,
  3: 25,
  4: 20,
  5: 15,
  6: 10,
};

type RoundEntry = {
  userId: string;
  status: "won" | "lost" | "playing";
  guessCount: number;
};

export type PlayerScore = {
  points: number;
  base: number;
  multiplier: number;
  multiplierReason: string;
};

export function scoreRound(entries: RoundEntry[]): Map<string, PlayerScore> {
  const scores = new Map<string, PlayerScore>();

  const winners = entries.filter((e) => e.status === "won");
  const bestGuessCount = winners.length > 0
    ? Math.min(...winners.map((w) => w.guessCount))
    : 0;
  const bestPlayers = winners.filter((w) => w.guessCount === bestGuessCount);

  for (const entry of entries) {
    if (entry.status !== "won") {
      scores.set(entry.userId, {
        points: 0,
        base: 0,
        multiplier: 1,
        multiplierReason: "",
      });
      continue;
    }

    const base = BASE_POINTS[entry.guessCount] || 0;
    let multiplier = 1;
    let multiplierReason = "";

    if (winners.length === 1) {
      // Only solver in the round
      multiplier = 3;
      multiplierReason = "Only solver";
    } else if (bestPlayers.length === 1 && entry.guessCount === bestGuessCount) {
      // Sole best score
      multiplier = 2;
      multiplierReason = "Best score";
    } else if (entry.guessCount === bestGuessCount) {
      // Tied for best
      multiplier = 1.5;
      multiplierReason = "Tied best";
    }
    // else: won but not best → 1x, no label

    scores.set(entry.userId, {
      points: Math.round(base * multiplier),
      base,
      multiplier,
      multiplierReason,
    });
  }

  return scores;
}
