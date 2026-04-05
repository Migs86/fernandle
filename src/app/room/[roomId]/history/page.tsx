import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rooms, roomMembers, games, guesses, users, roomEvents } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { evaluateGuess } from "@/lib/game-logic";
import type { LetterResult } from "@/types";

type RoundResult = {
  wordIndex: number;
  answer: string;
  players: {
    name: string;
    avatarUrl: string | null;
    status: string;
    guessCount: number;
    guessWords: string[];
  }[];
};

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/api/auth/signin?callbackUrl=/room/${roomId}/history`);

  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Room not found.</p>
      </div>
    );
  }

  // Get all members
  const members = await db
    .select({ userId: roomMembers.userId, name: users.name, avatarUrl: users.avatarUrl })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId));

  const memberMap = new Map(members.map((m) => [m.userId, m]));

  // Get all completed games grouped by wordIndex, exclude current round if still playing
  const allGames = await db
    .select({
      userId: games.userId,
      wordIndex: games.wordIndex,
      status: games.status,
      gameId: games.id,
    })
    .from(games)
    .where(and(eq(games.roomId, roomId), sql`${games.status} != 'playing'`))
    .orderBy(desc(games.wordIndex));

  // Get answers from round_complete events
  const roundCompleteEvents = await db
    .select({ payload: roomEvents.payload })
    .from(roomEvents)
    .where(and(eq(roomEvents.roomId, roomId), eq(roomEvents.eventType, "round_complete")));

  const answersByWordIndex = new Map<number, string>();
  for (const event of roundCompleteEvents) {
    const p = event.payload as { wordIndex: number; answer?: string };
    if (p.answer) answersByWordIndex.set(p.wordIndex, p.answer);
  }

  const roundMap = new Map<number, RoundResult>();

  for (const game of allGames) {
    if (!roundMap.has(game.wordIndex)) {
      roundMap.set(game.wordIndex, {
        wordIndex: game.wordIndex,
        answer: answersByWordIndex.get(game.wordIndex) || "",
        players: [],
      });
    }

    const round = roundMap.get(game.wordIndex)!;
    const member = memberMap.get(game.userId);

    // Get guesses for this game
    const gameGuesses = await db
      .select({ guess: guesses.guess })
      .from(guesses)
      .where(eq(guesses.gameId, game.gameId))
      .orderBy(guesses.position);

    const guessWords = gameGuesses.map((g) => g.guess);

    // Fallback: if no round_complete event, reconstruct from won game
    if (!round.answer && game.status === "won" && guessWords.length > 0) {
      round.answer = guessWords[guessWords.length - 1];
    }

    round.players.push({
      name: member?.name || "Unknown",
      avatarUrl: member?.avatarUrl || null,
      status: game.status,
      guessCount: guessWords.length,
      guessWords,
    });
  }

  // Sort rounds by wordIndex descending (most recent first)
  const rounds = Array.from(roundMap.values()).sort(
    (a, b) => b.wordIndex - a.wordIndex
  );

  // Get active members for player list
  const activeMembers = members.filter((m) => {
    // Check if member is active (we queried without isActive filter for history)
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <p className="text-sm text-muted-foreground">
              Game history &middot; {rounds.length} rounds
            </p>
          </div>
          <a
            href={`/room/${roomId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to game
          </a>
        </div>

        {/* Players in room */}
        <div className="flex flex-wrap gap-2">
          {activeMembers.map((m) => (
            <div key={m.userId} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-xs">
              <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  m.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="font-medium">{m.name}</span>
            </div>
          ))}
        </div>

        {rounds.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No completed rounds yet.</p>
        ) : (
          <div className="space-y-3">
            {rounds.map((round) => (
              <div
                key={round.wordIndex}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* Round header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">
                      #{round.wordIndex + 1}
                    </span>
                    {round.answer ? (
                      <span className={`text-lg font-bold font-mono uppercase tracking-wider ${
                        round.players.some((p) => p.status === "won") ? "text-green-500" : "text-foreground"
                      }`}>
                        {round.answer}
                      </span>
                    ) : (
                      <span className="text-lg font-bold font-mono uppercase tracking-wider text-muted-foreground">
                        ???
                      </span>
                    )}
                  </div>
                </div>

                {/* Player results */}
                <div className="space-y-2">
                  {round.players
                    .sort((a, b) => {
                      // Won before lost, then by guess count
                      if (a.status === "won" && b.status !== "won") return -1;
                      if (a.status !== "won" && b.status === "won") return 1;
                      return a.guessCount - b.guessCount;
                    })
                    .map((player, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                          {player.avatarUrl ? (
                            <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            player.name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <span className="text-sm font-medium w-24 truncate">
                          {player.name}
                        </span>
                        <span
                          className={`text-xs font-mono font-bold w-8 ${
                            player.status === "won" ? "text-green-500" : "text-red-400"
                          }`}
                        >
                          {player.status === "won" ? `${player.guessCount}/6` : "X/6"}
                        </span>
                        {/* Mini guess trail with colored letters */}
                        <div className="flex gap-1.5 flex-1 overflow-hidden flex-wrap">
                          {player.guessWords.map((word, j) => {
                            const results = round.answer ? evaluateGuess(word, round.answer) : [];
                            return (
                              <span key={j} className="font-mono text-[11px] uppercase tracking-wide">
                                {word.split("").map((letter, k) => (
                                  <span
                                    key={k}
                                    className={
                                      results[k] === "correct" ? "text-green-500 font-bold" :
                                      results[k] === "present" ? "text-yellow-500 font-bold" :
                                      "text-zinc-500"
                                    }
                                  >
                                    {letter}
                                  </span>
                                ))}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
