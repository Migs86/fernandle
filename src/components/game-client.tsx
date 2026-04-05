"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { GameBoard } from "./game-board";
import { Keyboard } from "./keyboard";
import { PlayerList } from "./player-list";
import { RoomHeader } from "./room-header";
import { SkipVoteButton } from "./skip-vote-button";
import { HintButton } from "./hint-button";
import { Button } from "@/components/ui/button";
import { useRoomEvents } from "@/hooks/use-room-events";
import { submitGuess, startNextWord } from "@/actions/game";
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
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundAnswer, setRoundAnswer] = useState(revealedWord || "");
  const [shameMessage, setShameMessage] = useState("");
  const [nextWordPending, startNextWordTransition] = useTransition();

  const keyColors = buildKeyboardColors(guessResults);
  const activePlayers = players.filter((p) => p.status === "playing");
  const totalActive = players.length;
  const votesNeeded = Math.ceil(totalActive / 2);

  // Reset state when word rotates
  const resetForNewWord = useCallback((newWordIndex: number) => {
    setGuessResults([]);
    setCurrentGuess("");
    setGameStatus("playing");
    setWordIndex(newWordIndex);
    setSkipVoteCount(0);
    setHasVoted(false);
    setRoundComplete(false);
    setRoundAnswer("");
    setError("");
  }, []);

  // Handle "Next Word" click
  const handleNextWord = () => {
    startNextWordTransition(async () => {
      await startNextWord(roomId);
    });
  };

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
      setRoundComplete(true);
      const answer = (payload as { answer?: string }).answer;
      if (answer) setRoundAnswer(answer);
    }

    if (type === "hint_attempt") {
      const hintUserId = (payload as { userId: string }).userId;
      if (hintUserId !== currentUserId) {
        const player = players.find((p) => p.userId === hintUserId);
        const name = player?.name || "Someone";
        setShameMessage(`${name} just tried to use a hint`);
        setTimeout(() => setShameMessage(""), 3000);
      }
    }

    if (type === "new_word") {
      const newIndex = (payload as { wordIndex: number }).wordIndex;
      setPlayers((prev) =>
        prev.map((p) => ({ ...p, guessCount: 0, status: "playing" as GameStatus }))
      );
      resetForNewWord(newIndex);
    }

    if (type === "skip_vote_update") {
      setSkipVoteCount((payload as { voteCount: number }).voteCount);
    }
  }, [resetForNewWord, currentUserId, players]));

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

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Game area */}
        <div className="flex-1 flex flex-col items-center min-h-0 px-2 sm:px-4">
          {/* Status / round complete overlay area */}
          <div className="shrink-0 py-1 sm:py-2 text-center">
            {roundComplete && (
              <div className="w-full max-w-sm rounded-lg border bg-card p-3 sm:p-4 space-y-2 sm:space-y-3 mx-auto">
                <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider">
                  Round #{wordIndex + 1} complete
                </p>
                <p className="text-xl sm:text-2xl font-bold font-mono uppercase tracking-widest">
                  {roundAnswer}
                </p>
                <div className="space-y-1 text-sm">
                  {players.map((p) => (
                    <div key={p.userId} className="flex items-center justify-between px-2">
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
                <Button
                  onClick={handleNextWord}
                  disabled={nextWordPending}
                  className="w-full"
                >
                  {nextWordPending ? "Starting..." : "Next Word"}
                </Button>
              </div>
            )}
            {!roundComplete && gameStatus === "won" && (
              <p className="text-green-600 font-bold text-sm sm:text-lg">
                You got it in {guessResults.length}! Waiting for others...
              </p>
            )}
            {!roundComplete && gameStatus === "lost" && (
              <p className="text-red-500 font-bold text-sm sm:text-lg">
                Out of guesses. Waiting for others...
              </p>
            )}
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            {shameMessage && (
              <p className="text-yellow-500 text-sm font-medium animate-in fade-in">{shameMessage}</p>
            )}
          </div>

          {/* Game board — fills available space */}
          <GameBoard
            guessResults={guessResults}
            currentGuess={currentGuess}
            gameOver={gameStatus !== "playing"}
          />

          {/* Bottom controls */}
          <div className="shrink-0 w-full py-1 sm:py-2 space-y-2">
            <Keyboard
              keyColors={keyColors}
              onKey={handleKey}
              disabled={gameStatus !== "playing" || submitting}
            />

            {gameStatus === "playing" && (
              <div className="flex justify-center">
                <HintButton roomId={roomId} />
              </div>
            )}

            {!roundComplete && gameStatus !== "playing" && activePlayers.length > 0 && (
              <div className="flex justify-center">
                <SkipVoteButton
                  roomId={roomId}
                  hasVoted={hasVoted}
                  voteCount={skipVoteCount}
                  totalPlayers={totalActive}
                  votesNeeded={votesNeeded}
                />
              </div>
            )}
          </div>
        </div>

        {/* Player sidebar — desktop only */}
        <div className="hidden lg:block lg:w-56 lg:border-l lg:pl-4 py-4">
          <PlayerList players={players} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
