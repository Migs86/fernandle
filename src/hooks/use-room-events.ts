"use client";

import { useEffect, useRef, useCallback } from "react";
import type { RoomEvent } from "@/types";

export function useRoomEvents(
  roomId: string,
  onEvent: (event: RoomEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Track last event ID across reconnections
  const lastEventIdRef = useRef<string>("0");

  const connect = useCallback(() => {
    const eventSource = new EventSource(
      `/api/room/${roomId}/events?lastEventId=${lastEventIdRef.current}`
    );

    eventSource.addEventListener("message", (e) => {
      try {
        const event = JSON.parse(e.data) as RoomEvent & { id?: string };
        // Track the event ID so reconnections don't replay
        if (event.id) {
          lastEventIdRef.current = event.id;
        }
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
