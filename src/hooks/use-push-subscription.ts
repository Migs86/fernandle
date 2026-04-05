"use client";

import { useEffect } from "react";
import { subscribePush } from "@/actions/push";

export function usePushSubscription() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          // Already subscribed, sync to server
          const json = existing.toJSON();
          await subscribePush({
            endpoint: existing.endpoint,
            keys: {
              p256dh: json.keys!.p256dh!,
              auth: json.keys!.auth!,
            },
          });
          return;
        }

        // Request permission and subscribe
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });

        const json = subscription.toJSON();
        await subscribePush({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys!.p256dh!,
            auth: json.keys!.auth!,
          },
        });
      } catch {
        // Push not supported or denied — silent fail
      }
    };

    register();
  }, []);
}
