"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  rooms,
  games,
  guesses,
  roomMembers,
  roomEvents,
  skipVotes,
  playerStats,
} from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { evaluateGuess } from "@/lib/game-logic";
import { isValidWord, getRandomWord } from "@/lib/words";
import type { LetterResult } from "@/types";

export async function submitGuess(
  roomId: string,
  guess: string
): Promise<{ results: LetterResult[] } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const normalizedGuess = guess.toLowerCase().trim();

  if (normalizedGuess.length !== 5) return { error: "Must be 5 letters" };
  if (!isValidWord(normalizedGuess)) return { error: "Not a valid word" };

  // Get room and current game
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) return { error: "Room not found" };

  const [game] = await db
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

  if (!game) return { error: "No active game" };
  if (game.status !== "playing") return { error: "Game already over" };

  // Count existing guesses
  const existingGuesses = await db
    .select()
    .from(guesses)
    .where(eq(guesses.gameId, game.id));

  const position = existingGuesses.length + 1;
  if (position > 6) return { error: "No guesses remaining" };

  // Evaluate the guess
  const results = evaluateGuess(normalizedGuess, room.currentWord);

  // Save guess
  await db.insert(guesses).values({
    gameId: game.id,
    guess: normalizedGuess,
    position,
  });

  const isCorrect = results.every((r) => r === "correct");
  const isLastGuess = position === 6;

  if (isCorrect || isLastGuess) {
    const status = isCorrect ? "won" : "lost";
    await db
      .update(games)
      .set({ status, completedAt: new Date() })
      .where(eq(games.id, game.id));

    // Update player stats
    await updatePlayerStats(session.user.id, status, position);

    // Emit player finished event
    await db.insert(roomEvents).values({
      roomId,
      eventType: "player_finished",
      payload: {
        userId: session.user.id,
        status,
        guessCount: position,
      },
    });

    // Check if all players finished
    await checkRoundComplete(roomId, room.wordIndex);
  } else {
    // Emit progress event
    await db.insert(roomEvents).values({
      roomId,
      eventType: "player_progress",
      payload: {
        userId: session.user.id,
        guessCount: position,
      },
    });
  }

  return { results };
}

export async function voteSkip(roomId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) throw new Error("Room not found");

  // Insert vote (idempotent via PK)
  await db
    .insert(skipVotes)
    .values({
      roomId,
      userId: session.user.id,
      wordIndex: room.wordIndex,
    })
    .onConflictDoNothing();

  // Count votes and active members
  const [{ count: voteCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skipVotes)
    .where(
      and(eq(skipVotes.roomId, roomId), eq(skipVotes.wordIndex, room.wordIndex))
    );

  const [{ count: memberCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  const needed = Math.ceil(memberCount / 2);

  // Emit vote event
  await db.insert(roomEvents).values({
    roomId,
    eventType: "skip_vote_update",
    payload: { voteCount, needed, totalPlayers: memberCount },
  });

  // If majority reached, skip
  if (voteCount >= needed) {
    // Mark all playing games as lost
    await db
      .update(games)
      .set({ status: "lost", completedAt: new Date() })
      .where(
        and(
          eq(games.roomId, roomId),
          eq(games.wordIndex, room.wordIndex),
          eq(games.status, "playing")
        )
      );

    // Emit round complete with the answer
    await db.insert(roomEvents).values({
      roomId,
      eventType: "round_complete",
      payload: { wordIndex: room.wordIndex, answer: room.currentWord, skipped: true },
    });
  }
}

async function checkRoundComplete(roomId: string, wordIndex: number) {
  // Check if any active member is still playing
  const activeMembers = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  for (const member of activeMembers) {
    const [game] = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.roomId, roomId),
          eq(games.userId, member.userId),
          eq(games.wordIndex, wordIndex)
        )
      )
      .limit(1);

    if (!game || game.status === "playing") {
      return; // Someone still playing
    }
  }

  // Everyone done — emit round complete (players must ready up to start next)
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  await db.insert(roomEvents).values({
    roomId,
    eventType: "round_complete",
    payload: { wordIndex, answer: room?.currentWord },
  });
}

async function rotateWord(roomId: string, expectedWordIndex: number) {
  const newWord = getRandomWord();

  // Atomically increment only if wordIndex hasn't changed (prevents double-rotation)
  const updated = await db
    .update(rooms)
    .set({
      currentWord: newWord,
      wordIndex: sql`${rooms.wordIndex} + 1`,
    })
    .where(and(eq(rooms.id, roomId), eq(rooms.wordIndex, expectedWordIndex)))
    .returning();

  if (updated.length === 0) {
    // Another request already rotated — no-op
    return;
  }

  const room = updated[0];

  // Create new games for all active members
  const activeMembers = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  if (activeMembers.length > 0) {
    await db.insert(games).values(
      activeMembers.map((m) => ({
        roomId,
        userId: m.userId,
        wordIndex: room.wordIndex,
      }))
    );
  }

  // Emit new word event
  await db.insert(roomEvents).values({
    roomId,
    eventType: "new_word",
    payload: { wordIndex: room.wordIndex },
  });
}

export async function readyForNext(roomId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) throw new Error("Room not found");

  // Verify round is actually complete (no one playing)
  const activeMembers = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  const stillPlaying = [];
  for (const member of activeMembers) {
    const [game] = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.roomId, roomId),
          eq(games.userId, member.userId),
          eq(games.wordIndex, room.wordIndex)
        )
      )
      .limit(1);

    if (game && game.status === "playing") {
      stillPlaying.push(member.userId);
    }
  }

  if (stillPlaying.length > 0) {
    throw new Error("Not all players have finished");
  }

  // Emit player_ready event (idempotent — we'll count distinct)
  await db.insert(roomEvents).values({
    roomId,
    eventType: "player_ready",
    payload: { userId: session.user.id, wordIndex: room.wordIndex },
  });

  // Count distinct ready players for this wordIndex
  const readyEvents = await db
    .select({ payload: roomEvents.payload })
    .from(roomEvents)
    .where(
      and(eq(roomEvents.roomId, roomId), eq(roomEvents.eventType, "player_ready"))
    );

  const readyUsers = new Set<string>();
  for (const event of readyEvents) {
    const p = event.payload as { userId: string; wordIndex: number };
    if (p.wordIndex === room.wordIndex) {
      readyUsers.add(p.userId);
    }
  }

  const readyCount = readyUsers.size;
  const totalMembers = activeMembers.length;

  // Emit ready update so all clients see the count
  await db.insert(roomEvents).values({
    roomId,
    eventType: "ready_update",
    payload: { readyCount, totalMembers, wordIndex: room.wordIndex },
  });

  // If everyone is ready, rotate to next word
  if (readyCount >= totalMembers) {
    await rotateWord(roomId, room.wordIndex);
  }
}

export async function requestHint(roomId: string): Promise<{ message: string }> {
  const session = await auth();
  if (!session?.user?.id) return { message: "Not authenticated" };

  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) return { message: "Room not found" };

  const [game] = await db
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

  if (!game) return { message: "No active game" };

  // Increment hint attempts
  await db
    .update(games)
    .set({ hintAttempts: sql`${games.hintAttempts} + 1` })
    .where(eq(games.id, game.id));

  // Emit a shame event so everyone sees it
  await db.insert(roomEvents).values({
    roomId,
    eventType: "hint_attempt",
    payload: {
      userId: session.user.id,
      totalAttempts: (game.hintAttempts || 0) + 1,
    },
  });

  // Rotating shame messages
  const messages = [
    "Nice try. There are no hints.",
    "Still no hints. But everyone knows you tried.",
    "The hint is: it's a 5-letter word.",
    "Hint: the answer is somewhere in the dictionary.",
    "Your teammates have been notified of your weakness.",
    "Hint: believe in yourself.",
    "The real hint was the friends you made along the way.",
    "You've been added to the leaderboard of shame.",
  ];

  const attempts = (game.hintAttempts || 0) + 1;
  return { message: messages[(attempts - 1) % messages.length] };
}

async function updatePlayerStats(
  userId: string,
  status: "won" | "lost",
  guessCount: number
) {
  const [stats] = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.userId, userId))
    .limit(1);

  if (!stats) return;

  const dist = [...stats.guessDistribution];
  const newPlayed = stats.gamesPlayed + 1;

  if (status === "won") {
    dist[guessCount - 1] = (dist[guessCount - 1] || 0) + 1;
    const newStreak = stats.currentStreak + 1;
    await db
      .update(playerStats)
      .set({
        gamesPlayed: newPlayed,
        gamesWon: stats.gamesWon + 1,
        currentStreak: newStreak,
        maxStreak: Math.max(stats.maxStreak, newStreak),
        guessDistribution: dist,
        lastPlayedAt: new Date(),
      })
      .where(eq(playerStats.userId, userId));
  } else {
    await db
      .update(playerStats)
      .set({
        gamesPlayed: newPlayed,
        currentStreak: 0,
        lastPlayedAt: new Date(),
      })
      .where(eq(playerStats.userId, userId));
  }
}
