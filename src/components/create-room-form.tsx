"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTransition } from "react";
import { createRoom } from "@/actions/room";

export function CreateRoomForm() {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const name = formData.get("name") as string;
      await createRoom(name || "Fernandle Room");
    });
  };

  return (
    <form action={handleSubmit} className="flex gap-2">
      <Input
        name="name"
        placeholder="Room name (optional)"
        className="flex-1"
        disabled={isPending}
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create Room"}
      </Button>
    </form>
  );
}
