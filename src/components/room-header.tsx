"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useTransition } from "react";
import { deleteRoom } from "@/actions/room";

type RoomHeaderProps = {
  roomId: string;
  roomName: string;
  wordNumber: number;
  playerCount: number;
  isAdmin?: boolean;
};

export function RoomHeader({ roomId, roomName, wordNumber, playerCount, isAdmin }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [deleting, startDelete] = useTransition();

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomId}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b sm:px-4 sm:py-3">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <a href="/" aria-label="Back to rooms">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Button>
        </a>
        <h1 className="text-base sm:text-lg font-bold truncate">{roomName}</h1>
        <Badge variant="secondary" className="font-mono text-xs">
          #{wordNumber + 1}
        </Badge>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">
          {playerCount} player{playerCount !== 1 ? "s" : ""}
        </span>
        <a href={`/room/${roomId}/history`}>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs sm:text-sm sm:px-3">
            History
          </Button>
        </a>
        <a href={`/room/${roomId}/stats`}>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs sm:text-sm sm:px-3">
            Stats
          </Button>
        </a>
        <Button variant="outline" size="sm" className="h-8 px-2 text-xs sm:text-sm sm:px-3" onClick={handleCopy}>
          {copied ? "Copied!" : "Invite"}
        </Button>
        {isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={() => {
              if (confirm("Delete this room? This cannot be undone.")) {
                startDelete(() => deleteRoom(roomId));
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        )}
      </div>
    </div>
  );
}
