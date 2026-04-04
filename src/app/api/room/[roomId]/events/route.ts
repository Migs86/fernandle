import { db } from "@/lib/db";
import { roomEvents } from "@/lib/schema";
import { and, eq, gt } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode("event: ping\ndata: connected\n\n"));

      const poll = async () => {
        if (closed) return;

        try {
          const events = await db
            .select()
            .from(roomEvents)
            .where(
              and(
                eq(roomEvents.roomId, roomId),
                gt(roomEvents.id, lastEventId)
              )
            )
            .orderBy(roomEvents.id)
            .limit(50);

          for (const event of events) {
            const data = JSON.stringify({
              type: event.eventType,
              payload: event.payload,
            });
            controller.enqueue(
              encoder.encode(`event: message\ndata: ${data}\n\n`)
            );
            lastEventId = event.id;
          }
        } catch {
          // DB error, will retry on next poll
        }

        if (!closed) {
          setTimeout(poll, 1500);
        }
      };

      poll();
    },
    cancel() {
      closed = true;
    },
  });

  // Listen for client disconnect
  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
