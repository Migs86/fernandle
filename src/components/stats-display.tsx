"use client";

import type { PlayerStatsData } from "@/types";

type StatsDisplayProps = {
  stats: PlayerStatsData;
};

export function StatsDisplay({ stats }: StatsDisplayProps) {
  const winPct =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  const maxGuesses = Math.max(...stats.guessDistribution, 1);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <StatBox label="Played" value={stats.gamesPlayed} />
        <StatBox label="Win %" value={winPct} />
        <StatBox label="Streak" value={stats.currentStreak} />
        <StatBox label="Max Streak" value={stats.maxStreak} />
      </div>

      {/* Guess distribution */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Guess Distribution
        </h3>
        <div className="space-y-1">
          {stats.guessDistribution.map((count, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-mono w-4 text-right">{i + 1}</span>
              <div
                className="bg-zinc-600 dark:bg-zinc-500 text-white text-xs font-bold px-2 py-0.5 rounded-sm min-w-[24px] text-right transition-all duration-300"
                style={{
                  width: `${Math.max((count / maxGuesses) * 100, 8)}%`,
                }}
              >
                {count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
