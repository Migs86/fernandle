"use client";

import { useEffect, useRef, useCallback } from "react";
import type { RoomEvent } from "@/types";

export function useRoomEvents(
  roomId: string,
  onEvent: (event: RoomEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const eventSource = new EventSource(`/api/room/${roomId}/events`);

    eventSource.addEventListener("message", (e) => {
      try {
        const event = JSON.parse(e.data) as RoomEvent;
        onEventRef.current(event);
      } catch {
        // Ignore malformed events
      }
    });

    eventSource.addEventListener("error", () => {
      eventSource.close();
      // Reconnect after a delay
      setTimeout(connect, 3000);
    });

    return eventSource;
  }, [roomId]);

  useEffect(() => {
    const es = connect();
    return () => es.close();
  }, [connect]);
}
