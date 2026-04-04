import { auth } from "@/lib/auth";
import { AuthButton } from "@/components/auth-button";
import { CreateRoomForm } from "@/components/create-room-form";
import { db } from "@/lib/db";
import { roomMembers, rooms } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function Home() {
  const session = await auth();

  // Load user's recent rooms
  let recentRooms: { id: string; name: string; wordIndex: number }[] = [];
  if (session?.user?.id) {
    recentRooms = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        wordIndex: rooms.wordIndex,
      })
      .from(roomMembers)
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(
        and(
          eq(roomMembers.userId, session.user.id),
          eq(roomMembers.isActive, true)
        )
      )
      .orderBy(desc(rooms.createdAt))
      .limit(10);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full gap-8 p-4">
      {/* Header */}
      <div className="absolute top-4 right-4">
        <AuthButton user={session?.user} />
      </div>

      {/* Hero */}
      <div className="text-center space-y-3">
        <h1 className="text-5xl font-bold tracking-tight">Fernandle</h1>
        <p className="text-muted-foreground text-lg max-w-md">
          Multiplayer Wordle. Same word, compete with friends.
          <br />
          No waiting for tomorrow.
        </p>
      </div>

      {/* Tile preview */}
      <div className="flex gap-1.5">
        {["F", "E", "R", "N", "S"].map((letter, i) => (
          <div
            key={i}
            className={`w-14 h-14 flex items-center justify-center text-2xl font-bold text-white rounded-md ${
              [
                "bg-green-600",
                "bg-yellow-500",
                "bg-green-600",
                "bg-zinc-600",
                "bg-green-600",
              ][i]
            }`}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Actions */}
      {session?.user ? (
        <div className="space-y-6 w-full max-w-sm">
          <CreateRoomForm />

          {recentRooms.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Your Rooms
              </h2>
              <div className="space-y-1">
                {recentRooms.map((room) => (
                  <a
                    key={room.id}
                    href={`/room/${room.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium">{room.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      Word #{room.wordIndex + 1}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="text-center">
            <a
              href="/stats"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View your stats
            </a>
          </div>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in to create or join a room
          </p>
          <AuthButton user={null} />
        </div>
      )}
    </div>
  );
}
