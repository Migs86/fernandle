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
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomId}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
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

      {/* Players + Menu */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Player avatars row */}
        <div className="flex -space-x-1.5">
          {players.slice(0, 5).map((p) => (
            <div
              key={p.userId}
              className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold overflow-hidden"
              title={p.name}
            >
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                p.name.slice(0, 2).toUpperCase()
              )}
            </div>
          ))}
          {players.length > 5 && (
            <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold">
              +{players.length - 5}
            </div>
          )}
        </div>

        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Room menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </Button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
              {/* Players section */}
              <div className="px-3 py-2 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Players ({players.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {players.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          p.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <span className="text-sm truncate flex-1">
                        {p.name}
                        {p.userId === currentUserId && (
                          <span className="text-muted-foreground"> (you)</span>
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
                            <div key={i} className={`w-1 h-1 rounded-full ${i < p.guessCount ? "bg-zinc-400" : "bg-zinc-700"}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <a
                  href={`/room/${roomId}/history`}
                  className="block px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  History
                </a>
                <a
                  href={`/room/${roomId}/stats`}
                  className="block px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Stats
                </a>
                <button
                  onClick={handleCopy}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  {copied ? "Link copied!" : "Copy invite link"}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this room? This cannot be undone.")) {
                        startDelete(() => deleteRoom(roomId));
                      }
                    }}
                    disabled={deleting}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete room"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
