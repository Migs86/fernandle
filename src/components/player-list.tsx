"use client";

import type { PlayerProgress } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type PlayerListProps = {
  players: PlayerProgress[];
  currentUserId: string;
};

export function PlayerList({ players, currentUserId }: PlayerListProps) {
  const waiting = players.filter((p) => p.status === "playing");
  const done = players.filter((p) => p.status !== "playing");

  return (
    <div className="space-y-4">
      {/* Waiting on */}
      {waiting.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Waiting on ({waiting.length})
          </h3>
          {waiting.map((player) => (
            <PlayerRow key={player.userId} player={player} isCurrentUser={player.userId === currentUserId} />
          ))}
        </div>
      )}

      {/* Finished */}
      {done.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Finished ({done.length})
          </h3>
          {done.map((player) => (
            <PlayerRow key={player.userId} player={player} isCurrentUser={player.userId === currentUserId} />
          ))}
        </div>
      )}

      {/* If nobody's waiting, everyone is done */}
      {waiting.length === 0 && done.length === 0 && (
        <p className="text-sm text-muted-foreground">No players yet</p>
      )}
    </div>
  );
}

function PlayerRow({ player, isCurrentUser }: { player: PlayerProgress; isCurrentUser: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 p-2 rounded-lg",
        isCurrentUser && "bg-muted/50",
      )}
    >
      <Avatar className="h-7 w-7">
        <AvatarImage src={player.avatarUrl || undefined} />
        <AvatarFallback className="text-xs">
          {player.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {player.name}
          {isCurrentUser && <span className="text-muted-foreground"> (you)</span>}
        </p>
      </div>
      <StatusIndicator status={player.status} guessCount={player.guessCount} />
    </div>
  );
}

function StatusIndicator({ status, guessCount }: { status: string; guessCount: number }) {
  if (status === "won") {
    return (
      <span className="text-xs font-mono font-bold text-green-500">{guessCount}/6</span>
    );
  }
  if (status === "lost") {
    return (
      <span className="text-xs font-mono font-bold text-red-400">X/6</span>
    );
  }
  // Playing — show progress dots
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            i < guessCount ? "bg-zinc-400" : "bg-zinc-700",
          )}
        />
      ))}
    </div>
  );
}
