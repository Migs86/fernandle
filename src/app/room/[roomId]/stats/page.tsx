import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rooms, roomMembers, games, guesses, users } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";

type LeaderboardEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
};

export default async function RoomStatsPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/api/auth/signin?callbackUrl=/room/${roomId}/stats`);

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
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  // Get all completed games for this room
  const allGames = await db
    .select({
      userId: games.userId,
      wordIndex: games.wordIndex,
      status: games.status,
      gameId: games.id,
    })
    .from(games)
    .where(and(eq(games.roomId, roomId), sql`${games.status} != 'playing'`));

  // For each game, get guess count
  const gameGuessCount: Record<string, number> = {};
  for (const game of allGames) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(guesses)
      .where(eq(guesses.gameId, game.gameId));
    gameGuessCount[game.gameId] = result.count;
  }

  // Build per-player stats
  const memberMap = new Map(members.map((m) => [m.userId, m]));

  // --- Average guess number (wins only, lower is better) ---
  const avgGuesses: LeaderboardEntry[] = [];
  for (const member of members) {
    const wins = allGames.filter(
      (g) => g.userId === member.userId && g.status === "won"
    );
    if (wins.length === 0) continue;
    const totalGuesses = wins.reduce(
      (sum, g) => sum + (gameGuessCount[g.gameId] || 0),
      0
    );
    avgGuesses.push({
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      value: Math.round((totalGuesses / wins.length) * 100) / 100,
    });
  }
  avgGuesses.sort((a, b) => a.value - b.value);

  // --- Total "wins" (best result in a round, no ties) ---
  // Group games by wordIndex, find rounds where exactly one player had the best (lowest guess count + won)
  const roundMap = new Map<number, { userId: string; status: string; guessCount: number }[]>();
  for (const game of allGames) {
    const entries = roundMap.get(game.wordIndex) || [];
    entries.push({
      userId: game.userId,
      status: game.status,
      guessCount: gameGuessCount[game.gameId] || 0,
    });
    roundMap.set(game.wordIndex, entries);
  }

  const winCounts: Record<string, number> = {};
  const lossCounts: Record<string, number> = {};
  for (const member of members) {
    winCounts[member.userId] = 0;
    lossCounts[member.userId] = 0;
  }

  for (const [, entries] of roundMap) {
    // Best result: won with fewest guesses
    const winners = entries.filter((e) => e.status === "won");
    if (winners.length > 0) {
      const bestGuessCount = Math.min(...winners.map((w) => w.guessCount));
      const bestPlayers = winners.filter((w) => w.guessCount === bestGuessCount);
      // Solo win counts. Multi-player: no ties.
      if (bestPlayers.length === 1) {
        winCounts[bestPlayers[0].userId]++;
      }
    }

    // Worst result only applies with 2+ players
    if (entries.length < 2) continue;

    const losers = entries.filter((e) => e.status === "lost");
    if (losers.length > 0) {
      if (losers.length === 1) {
        lossCounts[losers[0].userId]++;
      }
    } else {
      // Everyone won — worst is highest guess count
      const worstGuessCount = Math.max(...entries.map((e) => e.guessCount));
      const worstPlayers = entries.filter((e) => e.guessCount === worstGuessCount);
      if (worstPlayers.length === 1) {
        lossCounts[worstPlayers[0].userId]++;
      }
    }
  }

  const totalWins: LeaderboardEntry[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      value: winCounts[m.userId],
    }))
    .sort((a, b) => b.value - a.value);

  const totalLosses: LeaderboardEntry[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      value: lossCounts[m.userId],
    }))
    .sort((a, b) => b.value - a.value);

  // --- Hint attempts (cheater leaderboard) ---
  const hintCounts: Record<string, number> = {};
  for (const member of members) {
    hintCounts[member.userId] = 0;
  }
  for (const game of allGames) {
    if (game.userId in hintCounts) {
      // Need to query hint_attempts for this game
      const [gameRow] = await db
        .select({ hintAttempts: games.hintAttempts })
        .from(games)
        .where(eq(games.id, game.gameId))
        .limit(1);
      hintCounts[game.userId] += gameRow?.hintAttempts || 0;
    }
  }

  const hintLeaderboard: LeaderboardEntry[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      value: hintCounts[m.userId],
    }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalRounds = roundMap.size;

  return (
    <div className="flex flex-col items-center min-h-full p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <p className="text-sm text-muted-foreground">
              Room stats &middot; {totalRounds} rounds played
            </p>
          </div>
          <a
            href={`/room/${roomId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to game
          </a>
        </div>

        {/* Average Guesses Leaderboard */}
        <Leaderboard
          title="Average Guesses"
          subtitle="Wins only, lower is better"
          entries={avgGuesses}
          formatValue={(v) => v.toFixed(2)}
          highlight="low"
        />

        {/* Total Wins */}
        <Leaderboard
          title="Total Wins"
          subtitle="Best result in round, no ties count"
          entries={totalWins}
          formatValue={(v) => String(v)}
          highlight="high"
        />

        {/* Total Losses */}
        <Leaderboard
          title="Total Losses"
          subtitle="Worst result in round, no ties count"
          entries={totalLosses}
          formatValue={(v) => String(v)}
          highlight="high-bad"
        />

        {/* Hint Attempts (Hall of Shame) */}
        {hintLeaderboard.length > 0 && (
          <Leaderboard
            title="Hall of Shame"
            subtitle="Total hint button presses"
            entries={hintLeaderboard}
            formatValue={(v) => String(v)}
            highlight="high-bad"
          />
        )}
      </div>
    </div>
  );
}

function Leaderboard({
  title,
  subtitle,
  entries,
  formatValue,
  highlight,
}: {
  title: string;
  subtitle: string;
  entries: LeaderboardEntry[];
  formatValue: (v: number) => string;
  highlight: "low" | "high" | "high-bad";
}) {
  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-sm text-muted-foreground py-3">No data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-1">
        {entries.map((entry, i) => {
          const isFirst = i === 0 && entry.value !== entries[1]?.value;
          return (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 p-2.5 rounded-lg ${
                isFirst
                  ? highlight === "high-bad"
                    ? "bg-red-500/10 border border-red-500/20"
                    : "bg-green-500/10 border border-green-500/20"
                  : "border border-transparent"
              }`}
            >
              <span className="text-sm font-mono w-6 text-muted-foreground text-right">
                {i + 1}.
              </span>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden">
                {entry.avatarUrl ? (
                  <img src={entry.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  entry.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="flex-1 text-sm font-medium truncate">
                {entry.name}
              </span>
              <span className="text-sm font-mono font-bold">
                {formatValue(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
