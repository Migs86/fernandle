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
        onClick={handleVote}
        disabled={hasVoted || isPending}
        className="h-10 text-sm"
      >
        {hasVoted ? "Voted to skip" : "Skip to next game"}
      </Button>
      <span className="text-sm text-muted-foreground">
        {voteCount}/{votesNeeded} needed
      </span>
    </div>
  );
}
