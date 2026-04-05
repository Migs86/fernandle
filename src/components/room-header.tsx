"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useTransition, useRef, useEffect } from "react";
import { deleteRoom } from "@/actions/room";
import type { PlayerProgress } from "@/types";

type RoomHeaderProps = {
  roomId: string;
  roomName: string;
  wordNumber: number;
  players: PlayerProgress[];
  currentUserId: string;
  isAdmin?: boolean;
};

export function RoomHeader({ roomId, roomName, wordNumber, players, currentUserId, isAdmin }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b sm:px-4 sm:py-3 shrink-0">
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

        {/* Right side: room button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs sm:text-sm gap-1.5 shrink-0"
          onClick={() => setDrawerOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          {players.length}
        </Button>
      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="relative w-full sm:max-w-sm bg-background border-t sm:border sm:rounded-lg max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200 sm:slide-in-from-bottom-0">
            {/* Handle (mobile) */}
            <div className="flex justify-center py-2 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2 pt-1 sm:pt-4">
              <h2 className="font-bold text-lg">Room</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDrawerOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </Button>
            </div>

            {/* Player list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Players ({players.length})
              </p>
              <div className="space-y-1">
                {players.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2.5 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">
                      {p.name}
                      {p.userId === currentUserId && (
                        <span className="text-muted-foreground font-normal"> (you)</span>
                      )}
                    </span>
                    {p.status === "won" && (
                      <span className="text-xs font-mono text-green-500 font-bold">{p.guessCount}/6</span>
                    )}
                    {p.status === "lost" && (
                      <span className="text-xs font-mono text-red-400 font-bold">X/6</span>
                    )}
                    {p.status === "playing" && (
                      <div className="flex gap-0.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < p.guessCount ? "bg-zinc-400" : "bg-zinc-700"}`} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t px-4 py-3 space-y-3">
              <div className="flex gap-2">
                <a href={`/room/${roomId}/stats`} className="flex-1">
                  <Button variant="outline" className="w-full h-10 text-sm">Stats</Button>
                </a>
                <a href={`/room/${roomId}/history`} className="flex-1">
                  <Button variant="outline" className="w-full h-10 text-sm">History</Button>
                </a>
                <Button
                  variant="outline"
                  className="flex-1 h-10 text-sm"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Invite"}
                </Button>
              </div>
              {isAdmin && (
                <Button
                  variant="destructive"
                  className="w-full h-10 text-sm mt-2"
                  disabled={deleting}
                  onClick={() => {
                    if (confirm("Delete this room? This cannot be undone.")) {
                      startDelete(() => deleteRoom(roomId));
                    }
                  }}
                >
                  {deleting ? "Deleting..." : "Delete room"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
