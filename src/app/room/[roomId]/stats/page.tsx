import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rooms, roomMembers, games, guesses, users } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";

type PlayerRoomStats = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  played: number;
  won: number;
  winPct: number;
  currentStreak: number;
  maxStreak: number;
  avgGuesses: number;
  guessDistribution: number[];
  hintAttempts: number;
  roundWins: number;
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

  // Get all completed games for this room, ordered by wordIndex for streak calculation
  const allGames = await db
    .select({
      userId: games.userId,
      wordIndex: games.wordIndex,
      status: games.status,
      gameId: games.id,
      hintAttempts: games.hintAttempts,
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

  // Group games by wordIndex for round-win calculation
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

  // Count round wins per player (best result, no ties)
  const roundWinCounts: Record<string, number> = {};
  for (const member of members) roundWinCounts[member.userId] = 0;
  for (const [, entries] of roundMap) {
    const winners = entries.filter((e) => e.status === "won");
    if (winners.length > 0) {
      const best = Math.min(...winners.map((w) => w.guessCount));
      const bestPlayers = winners.filter((w) => w.guessCount === best);
      if (bestPlayers.length === 1) {
        roundWinCounts[bestPlayers[0].userId]++;
      }
    }
  }

  // Build per-player stats
  const playerStats: PlayerRoomStats[] = members.map((member) => {
    const playerGames = allGames
      .filter((g) => g.userId === member.userId)
      .sort((a, b) => a.wordIndex - b.wordIndex);

    const played = playerGames.length;
    const won = playerGames.filter((g) => g.status === "won").length;
    const winPct = played > 0 ? Math.round((won / played) * 100) : 0;

    // Streaks (based on wordIndex order within this room)
    let currentStreak = 0;
    let maxStreak = 0;
    let streak = 0;
    for (const g of playerGames) {
      if (g.status === "won") {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    currentStreak = streak;

    // Average guesses (wins only)
    const wins = playerGames.filter((g) => g.status === "won");
    const totalGuesses = wins.reduce((sum, g) => sum + (gameGuessCount[g.gameId] || 0), 0);
    const avgGuesses = wins.length > 0 ? Math.round((totalGuesses / wins.length) * 100) / 100 : 0;

    // Guess distribution
    const guessDistribution = [0, 0, 0, 0, 0, 0];
    for (const g of wins) {
      const count = gameGuessCount[g.gameId] || 0;
      if (count >= 1 && count <= 6) {
        guessDistribution[count - 1]++;
      }
    }

    // Hint attempts
    const hintAttempts = playerGames.reduce((sum, g) => sum + (g.hintAttempts || 0), 0);

    return {
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      played,
      won,
      winPct,
      currentStreak,
      maxStreak,
      avgGuesses,
      guessDistribution,
      hintAttempts,
      roundWins: roundWinCounts[member.userId] || 0,
    };
  });

  // Sort by round wins desc, then win% desc
  playerStats.sort((a, b) => b.roundWins - a.roundWins || b.winPct - a.winPct);

  const totalRounds = roundMap.size;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="w-full max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <p className="text-sm text-muted-foreground">
              {totalRounds} rounds played
            </p>
          </div>
          <a
            href={`/room/${roomId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to game
          </a>
        </div>

        {/* Per-player stat cards */}
        {playerStats.map((player) => (
          <PlayerStatCard key={player.userId} player={player} isYou={player.userId === session.user!.id} />
        ))}

        {playerStats.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No games completed yet.</p>
        )}
      </div>
    </div>
  );
}

function PlayerStatCard({ player, isYou }: { player: PlayerRoomStats; isYou: boolean }) {
  const maxDist = Math.max(...player.guessDistribution, 1);

  return (
    <div className={`rounded-lg border p-4 space-y-4 ${isYou ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
      {/* Player name */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
          {player.avatarUrl ? (
            <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            player.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-bold truncate">
            {player.name} {isYou && <span className="text-xs text-muted-foreground font-normal">(you)</span>}
          </h2>
          {player.hintAttempts > 0 && (
            <p className="text-xs text-yellow-500">{player.hintAttempts} hint attempt{player.hintAttempts !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-1 text-center">
        <div>
          <p className="text-2xl font-bold">{player.played}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Played</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{player.winPct}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Win %</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{player.currentStreak}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Streak</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{player.maxStreak}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Max</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-500">{player.roundWins}</p>
          <p className="text-[10px] text-muted-foreground uppercase">1st Place</p>
        </div>
      </div>

      {/* Guess distribution */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Guess Distribution</p>
        {player.guessDistribution.map((count, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-mono w-3 text-right text-muted-foreground">{i + 1}</span>
            <div className="flex-1 h-5 flex items-center">
              <div
                className={`h-full rounded-sm flex items-center justify-end px-1.5 text-xs font-bold text-white ${
                  count > 0 ? "bg-zinc-500" : "bg-zinc-700"
                }`}
                style={{ width: count > 0 ? `${Math.max((count / maxDist) * 100, 12)}%` : "24px" }}
              >
                {count}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Average guesses */}
      {player.avgGuesses > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Avg. guesses per win: <span className="font-mono font-bold text-foreground">{player.avgGuesses.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}
