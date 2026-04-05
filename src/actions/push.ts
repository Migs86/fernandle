"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushSubscriptions, users, roomMembers, games, roomEvents } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:fernandle@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const NUDGE_MESSAGES = [
  "Hurry up, we're all waiting!",
  "Some of us have lives, you know.",
  "Did you fall asleep on your phone?",
  "Even a monkey with a typewriter would be done by now.",
  "We're growing old over here...",
  "Is this your first time reading?",
  "The word isn't THAT hard. Or is it?",
  "Everyone's watching. No pressure.",
  "Your turn. Today, preferably.",
  "Legend has it they're still guessing...",
  "We started a group chat about how slow you are.",
  "The dictionary isn't THAT big.",
  "Even autocorrect is judging you right now.",
  "At this rate, tomorrow's word will be out first.",
  "We've had time to learn a new language waiting for you.",
  "Plot twist: the word was 'HURRY'.",
];

export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await db
    .insert(pushSubscriptions)
    .values({
      userId: session.user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: session.user.id,
        keys: subscription.keys,
      },
    });
}

export async function nudgePlayer(roomId: string, targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Get nudger's name
  const [nudger] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const nudgerName = nudger?.name || "Someone";
  const message = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];

  // Emit nudge event via SSE (in-app notification)
  await db.insert(roomEvents).values({
    roomId,
    eventType: "nudge",
    payload: {
      fromUserId: session.user.id,
      fromName: nudgerName,
      targetUserId,
      message,
    },
  });

  // Send push notification
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, targetUserId));

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        JSON.stringify({
          title: `${nudgerName} nudged you!`,
          body: message,
          url: `/room/${roomId}`,
        })
      );
    } catch (err: unknown) {
      // Remove expired subscriptions
      if (err && typeof err === "object" && "statusCode" in err && ((err as { statusCode: number }).statusCode === 410 || (err as { statusCode: number }).statusCode === 404)) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}
