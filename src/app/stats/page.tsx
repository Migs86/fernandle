import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { playerStats } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { StatsDisplay } from "@/components/stats-display";
import type { PlayerStatsData } from "@/types";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [stats] = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.userId, session.user.id))
    .limit(1);

  const data: PlayerStatsData = stats
    ? {
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
        currentStreak: stats.currentStreak,
        maxStreak: stats.maxStreak,
        guessDistribution: stats.guessDistribution,
      }
    : {
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        guessDistribution: [0, 0, 0, 0, 0, 0],
      };

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Stats</h1>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back
          </a>
        </div>
        <StatsDisplay stats={data} />
      </div>
    </div>
  );
}
