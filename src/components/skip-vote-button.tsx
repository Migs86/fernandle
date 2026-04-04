"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { voteSkip } from "@/actions/game";

type SkipVoteButtonProps = {
  roomId: string;
  hasVoted: boolean;
  voteCount: number;
  totalPlayers: number;
  votesNeeded: number;
};

export function SkipVoteButton({
  roomId,
  hasVoted,
  voteCount,
  totalPlayers,
  votesNeeded,
}: SkipVoteButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleVote = () => {
    startTransition(async () => {
      await voteSkip(roomId);
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleVote}
        disabled={hasVoted || isPending}
        className="text-xs"
      >
        {hasVoted ? "Voted to skip" : "Vote to skip"}
      </Button>
      <span className="text-xs text-muted-foreground">
        {voteCount}/{votesNeeded} needed ({totalPlayers} players)
      </span>
    </div>
  );
}
