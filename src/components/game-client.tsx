"use client";

import { useState, useCallback, useEffect, useTransition, useRef } from "react";
import { GameBoard } from "./game-board";
import { Keyboard } from "./keyboard";
import { RoomHeader } from "./room-header";
import { SkipVoteButton } from "./skip-vote-button";
import { Button } from "@/components/ui/button";
import { useRoomEvents } from "@/hooks/use-room-events";
import { submitGuess, readyForNext } from "@/actions/game";
import { buildKeyboardColors } from "@/lib/game-logic";
import type { GuessResult, PlayerProgress, GameStatus, LetterResult } from "@/types";

type GameClientProps = {
  roomId: string;
  roomName: string;
  wordIndex: number;
  currentUserId: string;
  initialGuesses: GuessResult[];
  initialStatus: GameStatus;
  initialPlayers: PlayerProgress[];
  initialSkipVotes: number;
  initialHasVoted: boolean;
  revealedWord?: string;
  isAdmin?: boolean;
};

export function GameClient({
  roomId,
  roomName,
  wordIndex: initialWordIndex,
  currentUserId,
  initialGuesses,
  initialStatus,
  initialPlayers,
  initialSkipVotes,
  initialHasVoted,
  revealedWord,
  isAdmin,
}: GameClientProps) {
  const [guessResults, setGuessResults] = useState<GuessResult[]>(initialGuesses);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameStatus, setGameStatus] = useState<GameStatus>(initialStatus);
  const [players, setPlayers] = useState<PlayerProgress[]>(initialPlayers);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wordIndex, setWordIndex] = useState(initialWordIndex);
  const [skipVoteCount, setSkipVoteCount] = useState(initialSkipVotes);
  const [hasVoted, setHasVoted] = useState(initialHasVoted);
  const [roundAnswer, setRoundAnswer] = useState(revealedWord || "");
  const [roundComplete, setRoundComplete] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [readyPending, startReadyTransition] = useTransition();

  const keyColors = buildKeyboardColors(guessResults);
  const finishedPlayers = players.filter((p) => p.status !== "playing");
  const totalActive = players.length;
  const votesNeeded = Math.ceil(totalActive / 2);
  const isPlaying = gameStatus === "playing";
  // Waiting: finished but round not complete yet (others still playing)
  const isWaiting = !isPlaying && !roundComplete;

  // Reset state when word rotates
  const resetForNewWord = useCallback((newWordIndex: number) => {
    setGuessResults([]);
    setCurrentGuess("");
    setGameStatus("playing");
    setWordIndex(newWordIndex);
    setSkipVoteCount(0);
    setHasVoted(false);
    setRoundAnswer("");
    setRoundComplete(false);
    setIsReady(false);
    setReadyCount(0);
    setError("");
  }, []);

  const handleReady = () => {
    setIsReady(true);
    startReadyTransition(async () => {
      await readyForNext(roomId);
    });
  };

  // Track wordIndex in a ref so SSE handler can guard against stale events
  const wordIndexRef = useRef(wordIndex);
  wordIndexRef.current = wordIndex;
  const playersRef = useRef(players);
  playersRef.current = players;

  // Handle SSE events
  useRoomEvents(roomId, useCallback((event) => {
    const { type, payload } = event;

    if (type === "player_progress" || type === "player_finished") {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.userId === (payload as { userId: string }).userId) {
            return {
              ...p,
              guessCount: (payload as { guessCount: number }).guessCount ?? p.guessCount,
              status: (payload as { status?: GameStatus }).status ?? p.status,
            };
          }
          return p;
        })
      );
    }

    if (type === "round_complete") {
      const eventWordIndex = (payload as { wordIndex?: number }).wordIndex;
      // Ignore stale round_complete events from previous rounds
      if (eventWordIndex !== undefined && eventWordIndex !== wordIndexRef.current) return;
      setRoundComplete(true);
      const answer = (payload as { answer?: string }).answer;
      if (answer) setRoundAnswer(answer);
    }

    if (type === "ready_update") {
      const eventWordIndex = (payload as { wordIndex?: number }).wordIndex;
      if (eventWordIndex !== undefined && eventWordIndex !== wordIndexRef.current) return;
      setReadyCount((payload as { readyCount: number }).readyCount);
    }

    if (type === "new_word") {
      const newIndex = (payload as { wordIndex: number }).wordIndex;
      // Only process if this is actually a newer word than what we have
      if (newIndex <= wordIndexRef.current) return;
      setPlayers((prev) =>
        prev.map((p) => ({ ...p, guessCount: 0, status: "playing" as GameStatus }))
      );
      resetForNewWord(newIndex);
    }

    if (type === "skip_vote_update") {
      setSkipVoteCount((payload as { voteCount: number }).voteCount);
    }
  }, [resetForNewWord, currentUserId]));

  // Handle keyboard input
  const handleKey = useCallback(
    (key: string) => {
      if (submitting || gameStatus !== "playing") return;

      if (key === "⌫") {
        setCurrentGuess((prev) => prev.slice(0, -1));
        setError("");
        return;
      }

      if (key === "Enter") {
        if (currentGuess.length !== 5) {
          setError("Not enough letters");
          return;
        }
        setSubmitting(true);
        setError("");
        submitGuess(roomId, currentGuess).then((result) => {
          setSubmitting(false);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          const newGuess: GuessResult = {
            guess: currentGuess.toLowerCase(),
            results: result.results,
          };
          setGuessResults((prev) => [...prev, newGuess]);
          setCurrentGuess("");

          const isCorrect = result.results.every((r: LetterResult) => r === "correct");
          if (isCorrect) {
            setGameStatus("won");
          } else if (guessResults.length + 1 >= 6) {
            setGameStatus("lost");
          }
        });
        return;
      }

      if (/^[a-z]$/.test(key) && currentGuess.length < 5) {
        setCurrentGuess((prev) => prev + key);
        setError("");
      }
    },
    [currentGuess, submitting, gameStatus, roomId, guessResults.length]
  );

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") handleKey("Enter");
      else if (e.key === "Backspace") handleKey("⌫");
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKey]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <RoomHeader
        roomId={roomId}
        roomName={roomName}
        wordNumber={wordIndex}
        players={players}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      <div className="flex-1 flex flex-col items-center min-h-0 overflow-hidden">
        {/* === PLAYING STATE === */}
        {isPlaying && (
          <>
            <div className="shrink-0 py-1 sm:py-2 text-center">
              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            </div>

            <GameBoard
              guessResults={guessResults}
              currentGuess={currentGuess}
              gameOver={false}
            />

            <div className="shrink-0 w-full px-2 sm:px-4 py-1 sm:py-2 space-y-2">
              <Keyboard
                keyColors={keyColors}
                onKey={handleKey}
                disabled={submitting}
              />
            </div>
          </>
        )}

        {/* === WAITING STATE (finished, others still playing) === */}
        {isWaiting && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
            <div>
              {gameStatus === "won" ? (
                <p className="text-green-500 font-bold text-xl">
                  You got it in {guessResults.length}!
                </p>
              ) : (
                <p className="text-red-400 font-bold text-xl">
                  Out of guesses
                </p>
              )}
            </div>

            <div className="space-y-2 w-full max-w-xs">
              <p className="text-lg font-semibold">
                Waiting for round to finish...
              </p>
              <p className="text-muted-foreground">
                {finishedPlayers.length}/{totalActive} have completed
              </p>

              <div className="space-y-1.5">
                {players.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="flex-1 text-left truncate">{p.name}</span>
                    {p.status === "won" && (
                      <span className="text-green-500 font-mono font-bold text-xs">{p.guessCount}/6</span>
                    )}
                    {p.status === "lost" && (
                      <span className="text-red-400 font-mono font-bold text-xs">X/6</span>
                    )}
                    {p.status === "playing" && (
                      <span className="text-muted-foreground text-xs">playing...</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <SkipVoteButton
              roomId={roomId}
              hasVoted={hasVoted}
              voteCount={skipVoteCount}
              totalPlayers={totalActive}
              votesNeeded={votesNeeded}
            />

            <div className="flex gap-4 text-sm">
              <a href={`/room/${roomId}/stats`} className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
                Stats
              </a>
              <a href={`/room/${roomId}/history`} className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
                History
              </a>
            </div>
          </div>
        )}

        {/* === ROUND COMPLETE — show answer, ready up for next === */}
        {roundComplete && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Round #{wordIndex + 1} complete
            </p>
            <p className="text-3xl font-bold font-mono uppercase tracking-widest">
              {roundAnswer}
            </p>

            {/* Results */}
            <div className="space-y-1 w-full max-w-xs">
              {players.map((p) => (
                <div key={p.userId} className="flex items-center justify-between text-sm px-2">
                  <span className={p.userId === currentUserId ? "font-bold" : ""}>
                    {p.name}
                  </span>
                  <span className={
                    p.status === "won"
                      ? "text-green-500 font-mono font-bold"
                      : "text-red-400 font-mono"
                  }>
                    {p.status === "won" ? `${p.guessCount}/6` : "X/6"}
                  </span>
                </div>
              ))}
            </div>

            {/* Ready up */}
            <div className="space-y-2 w-full max-w-xs">
              <Button
                onClick={handleReady}
                disabled={isReady || readyPending}
                className="w-full"
                size="lg"
              >
                {isReady ? "Waiting for others..." : "Next Game"}
              </Button>
              <p className="text-sm text-muted-foreground">
                {readyCount}/{Math.ceil(totalActive / 2)} needed to start
              </p>
            </div>

            <div className="flex gap-4 text-sm">
              <a href={`/room/${roomId}/stats`} className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
                Stats
              </a>
              <a href={`/room/${roomId}/history`} className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
                History
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
