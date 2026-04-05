import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  rooms,
  roomMembers,
  games,
  guesses,
  users,
  skipVotes,
} from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { evaluateGuess } from "@/lib/game-logic";
import { joinRoom } from "@/actions/room";
import { GameClient } from "@/components/game-client";
import type { GuessResult, PlayerProgress, GameStatus } from "@/types";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/room/${roomId}`);
  }

  // Check room exists
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Room not found.</p>
      </div>
    );
  }

  // Join room (idempotent)
  await joinRoom(roomId);

  // Load current game
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

  // Load guesses for current game
  let initialGuesses: GuessResult[] = [];
  let gameStatus: GameStatus = "playing";
  let revealedWord: string | undefined;

  if (game) {
    gameStatus = game.status as GameStatus;
    const gameGuesses = await db
      .select()
      .from(guesses)
      .where(eq(guesses.gameId, game.id))
      .orderBy(guesses.position);

    initialGuesses = gameGuesses.map((g) => ({
      guess: g.guess,
      results: evaluateGuess(g.guess, room.currentWord),
    }));

    if (gameStatus === "lost") {
      revealedWord = room.currentWord;
    }
  }

  // Load all players and their progress
  const members = await db
    .select({
      userId: roomMembers.userId,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.isActive, true)));

  const playerProgress: PlayerProgress[] = await Promise.all(
    members.map(async (m) => {
      const [playerGame] = await db
        .select()
        .from(games)
        .where(
          and(
            eq(games.roomId, roomId),
            eq(games.userId, m.userId),
            eq(games.wordIndex, room.wordIndex)
          )
        )
        .limit(1);

      let guessCount = 0;
      if (playerGame) {
        const playerGuesses = await db
          .select()
          .from(guesses)
          .where(eq(guesses.gameId, playerGame.id));
        guessCount = playerGuesses.length;
      }

      return {
        userId: m.userId,
        name: m.name,
        avatarUrl: m.avatarUrl,
        guessCount,
        status: (playerGame?.status || "playing") as GameStatus,
      };
    })
  );

  // Load skip votes for current round
  const currentSkipVotes = await db
    .select()
    .from(skipVotes)
    .where(
      and(eq(skipVotes.roomId, roomId), eq(skipVotes.wordIndex, room.wordIndex))
    );

  const hasVoted = currentSkipVotes.some((v) => v.userId === session.user!.id);

  // Check admin
  const [currentUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const isAdmin = currentUser?.email === "miguelenriquefernando@gmail.com";

  return (
    <GameClient
      roomId={roomId}
      roomName={room.name}
      wordIndex={room.wordIndex}
      currentUserId={session.user.id}
      initialGuesses={initialGuesses}
      initialStatus={gameStatus}
      initialPlayers={playerProgress}
      initialSkipVotes={currentSkipVotes.length}
      initialHasVoted={hasVoted}
      revealedWord={revealedWord}
      isAdmin={isAdmin}
    />
  );
}
