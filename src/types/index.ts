export type LetterResult = "correct" | "present" | "absent";

export type GuessResult = {
  guess: string;
  results: LetterResult[];
};

export type GameStatus = "playing" | "won" | "lost";

export type PlayerProgress = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  guessCount: number;
  status: GameStatus;
};

export type RoomEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type PlayerStatsData = {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
};
