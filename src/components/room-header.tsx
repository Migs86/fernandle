"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

type RoomHeaderProps = {
  roomId: string;
  roomName: string;
  wordNumber: number;
  playerCount: number;
};

export function RoomHeader({ roomId, roomName, wordNumber, playerCount }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomId}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">{roomName}</h1>
        <Badge variant="secondary" className="font-mono text-xs">
          #{wordNumber + 1}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {playerCount} player{playerCount !== 1 ? "s" : ""}
        </span>
        <a href={`/room/${roomId}/history`}>
          <Button variant="ghost" size="sm">
            History
          </Button>
        </a>
        <a href={`/room/${roomId}/stats`}>
          <Button variant="ghost" size="sm">
            Stats
          </Button>
        </a>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Invite"}
        </Button>
      </div>
    </div>
  );
}
