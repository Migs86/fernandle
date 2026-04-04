import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rooms, roomMembers, games, guesses, users } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

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

  // Get the answer for each past round from room_events
  // We stored the answer in round_complete events
  // But we can also reconstruct: for a won game, the last guess IS the answer
  // For robustness, let's get answers from won games
  const roundMap = new Map<number, RoundResult>();

  for (const game of allGames) {
    if (!roundMap.has(game.wordIndex)) {
      roundMap.set(game.wordIndex, {
        wordIndex: game.wordIndex,
        answer: "",
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

    // If someone won, their last guess is the answer
    if (game.status === "won" && guessWords.length > 0 && !round.answer) {
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

  return (
    <div className="flex flex-col items-center min-h-full p-4">
      <div className="w-full max-w-2xl space-y-6">
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
                    <span className="text-lg font-bold font-mono uppercase tracking-wider">
                      {round.answer || "???"}
                    </span>
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
                        {/* Mini guess trail */}
                        <div className="flex gap-1 flex-1 overflow-hidden">
                          {player.guessWords.map((word, j) => (
                            <span
                              key={j}
                              className="text-[10px] font-mono text-muted-foreground uppercase"
                            >
                              {word}
                            </span>
                          ))}
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
