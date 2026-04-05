import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rooms, roomMembers, games, guesses, users } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { scoreRound } from "@/lib/scoring";

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
  roundWins: number;
  totalPoints: number;
  bestRound: number;
  multiplierCount: number; // rounds with 2x or 3x
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

  // Group games by wordIndex
  const roundMap = new Map<number, { userId: string; status: string; guessCount: number; gameId: string }[]>();
  for (const game of allGames) {
    const entries = roundMap.get(game.wordIndex) || [];
    entries.push({
      userId: game.userId,
      status: game.status,
      guessCount: gameGuessCount[game.gameId] || 0,
      gameId: game.gameId,
    });
    roundMap.set(game.wordIndex, entries);
  }

  // Calculate points per player across all rounds
  const pointTotals: Record<string, number> = {};
  const bestRounds: Record<string, number> = {};
  const multiplierCounts: Record<string, number> = {};
  const roundWinCounts: Record<string, number> = {};
  for (const member of members) {
    pointTotals[member.userId] = 0;
    bestRounds[member.userId] = 0;
    multiplierCounts[member.userId] = 0;
    roundWinCounts[member.userId] = 0;
  }

  for (const [, entries] of roundMap) {
    const roundScores = scoreRound(
      entries.map((e) => ({
        userId: e.userId,
        status: e.status as "won" | "lost" | "playing",
        guessCount: e.guessCount,
      }))
    );

    for (const [userId, score] of roundScores) {
      if (!(userId in pointTotals)) continue;
      pointTotals[userId] += score.points;
      bestRounds[userId] = Math.max(bestRounds[userId], score.points);
      if (score.multiplier >= 2) multiplierCounts[userId]++;
    }

    // Round wins (sole best)
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

    const wins = playerGames.filter((g) => g.status === "won");
    const totalGuesses = wins.reduce((sum, g) => sum + (gameGuessCount[g.gameId] || 0), 0);
    const avgGuesses = wins.length > 0 ? Math.round((totalGuesses / wins.length) * 100) / 100 : 0;

    const guessDistribution = [0, 0, 0, 0, 0, 0];
    for (const g of wins) {
      const count = gameGuessCount[g.gameId] || 0;
      if (count >= 1 && count <= 6) {
        guessDistribution[count - 1]++;
      }
    }

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
      roundWins: roundWinCounts[member.userId] || 0,
      totalPoints: pointTotals[member.userId] || 0,
      bestRound: bestRounds[member.userId] || 0,
      multiplierCount: multiplierCounts[member.userId] || 0,
    };
  });

  // Sort leaderboard by points
  const leaderboard = [...playerStats].sort((a, b) => b.totalPoints - a.totalPoints);

  // Sort stat cards by points too
  playerStats.sort((a, b) => b.totalPoints - a.totalPoints);

  const totalRounds = roundMap.size;
  const topScore = leaderboard[0]?.totalPoints || 0;

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

        {/* Points Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="font-bold text-lg">Leaderboard</h2>
            <div className="space-y-2">
              {leaderboard.map((player, i) => {
                const barWidth = topScore > 0 ? (player.totalPoints / topScore) * 100 : 0;
                const isYou = player.userId === session.user!.id;
                const medal = i === 0 && player.totalPoints > 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return (
                  <div key={player.userId} className={`rounded-lg p-2.5 ${isYou ? "bg-primary/10" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm w-5 text-center">{medal || `${i + 1}.`}</span>
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                        {player.avatarUrl ? (
                          <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          player.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <span className="text-sm font-medium flex-1 truncate">
                        {player.name}
                        {isYou && <span className="text-muted-foreground font-normal"> (you)</span>}
                      </span>
                      <span className="text-lg font-bold font-mono">{player.totalPoints}</span>
                      <span className="text-[10px] text-muted-foreground">pts</span>
                    </div>
                    {/* Points bar */}
                    <div className="ml-14 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.max(barWidth, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scoring legend */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">How scoring works</summary>
              <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                <p>Base: 1 guess = 50, 2 = 35, 3 = 25, 4 = 20, 5 = 15, 6 = 10</p>
                <p>Only solver in round: <span className="text-yellow-500 font-bold">3x</span></p>
                <p>Best score (sole): <span className="text-green-500 font-bold">2x</span></p>
                <p>Tied for best: <span className="text-blue-400 font-bold">1.5x</span></p>
              </div>
            </details>
          </div>
        )}

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
      {/* Player name + points */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
          {player.avatarUrl ? (
            <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            player.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold truncate">
            {player.name} {isYou && <span className="text-xs text-muted-foreground font-normal">(you)</span>}
          </h2>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold font-mono">{player.totalPoints}</p>
          <p className="text-[10px] text-muted-foreground">points</p>
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
          <p className="text-2xl font-bold">{player.bestRound}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Best Rnd</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-yellow-500">{player.multiplierCount}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Bonuses</p>
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
