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
    <div className="flex flex-col h-full">
      <RoomHeader
        roomId={roomId}
        roomName={roomName}
        wordNumber={wordIndex}
        playerCount={players.length}
      />

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-4xl mx-auto w-full">
        {/* Game area */}
        <div className="flex-1 flex flex-col items-center gap-4">
          {/* Round complete summary */}
          {roundComplete && (
            <div className="w-full max-w-sm rounded-lg border bg-card p-4 space-y-3 text-center">
              <p className="text-sm text-muted-foreground uppercase tracking-wider">
                Round #{wordIndex + 1} complete
              </p>
              <p className="text-2xl font-bold font-mono uppercase tracking-widest">
                {roundAnswer}
              </p>
              {/* Round results */}
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

          {/* Status messages (when round NOT complete) */}
          {!roundComplete && gameStatus === "won" && (
            <div className="text-green-600 font-bold text-lg">
              You got it in {guessResults.length}! Waiting for others...
            </div>
          )}
          {!roundComplete && gameStatus === "lost" && (
            <div className="text-red-500 font-bold text-lg">
              Out of guesses. Waiting for others...
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm font-medium">{error}</div>
          )}
          {shameMessage && (
            <div className="text-yellow-500 text-sm font-medium animate-in fade-in">
              {shameMessage}
            </div>
          )}

          <GameBoard
            guessResults={guessResults}
            currentGuess={currentGuess}
            gameOver={gameStatus !== "playing"}
          />

          <Keyboard
            keyColors={keyColors}
            onKey={handleKey}
            disabled={gameStatus !== "playing" || submitting}
          />

          {/* Hint button — only while playing */}
          {gameStatus === "playing" && (
            <HintButton roomId={roomId} />
          )}

          {/* Skip vote — show when you're done but others aren't, and round not yet complete */}
          {!roundComplete && gameStatus !== "playing" && activePlayers.length > 0 && (
            <div className="mt-2">
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

        {/* Player sidebar */}
        <div className="lg:w-64 lg:border-l lg:pl-4">
          <PlayerList players={players} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
