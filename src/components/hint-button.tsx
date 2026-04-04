"use client";

import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { requestHint } from "@/actions/game";

type HintButtonProps = {
  roomId: string;
};

export function HintButton({ roomId }: HintButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const handleHint = () => {
    startTransition(async () => {
      const result = await requestHint(roomId);
      setMessage(result.message);
      setAttempts((prev) => prev + 1);
      // Auto-dismiss after 4 seconds
      setTimeout(() => setMessage(null), 4000);
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleHint}
        disabled={isPending}
        className="text-xs text-muted-foreground hover:text-yellow-500"
      >
        {isPending ? "..." : "Hint"}{" "}
        {attempts > 0 && (
          <span className="text-yellow-500 ml-1">({attempts})</span>
        )}
      </Button>
      {message && (
        <p className="text-xs text-yellow-500 animate-in fade-in text-center max-w-[250px]">
          {message}
        </p>
      )}
    </div>
  );
}
