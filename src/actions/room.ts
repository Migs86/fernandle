"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rooms, roomMembers, games } from "@/lib/schema";
import { getRandomWord } from "@/lib/words";
import { eq, and } from "drizzle-orm";

export async function createRoom(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const roomId = nanoid(6).toLowerCase();
  const word = getRandomWord();

  await db.insert(rooms).values({
    id: roomId,
    name: name || "Fernandle Room",
    createdBy: session.user.id,
    currentWord: word,
    wordIndex: 0,
  });

  await db.insert(roomMembers).values({
    roomId,
    userId: session.user.id,
    isActive: true,
  });

  await db.insert(games).values({
    roomId,
    userId: session.user.id,
    wordIndex: 0,
  });

  redirect(`/room/${roomId}`);
}

export async function joinRoom(roomId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Check room exists
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) throw new Error("Room not found");

  // Upsert membership
  await db
    .insert(roomMembers)
    .values({
      roomId,
      userId: session.user.id,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [roomMembers.roomId, roomMembers.userId],
      set: { isActive: true },
    });

  // Create game for current word if doesn't exist
  const existing = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.roomId, roomId),
        eq(games.userId, session.user.id),
        eq(games.wordIndex, room.wordIndex)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(games).values({
      roomId,
      userId: session.user.id,
      wordIndex: room.wordIndex,
    });
  }
}
