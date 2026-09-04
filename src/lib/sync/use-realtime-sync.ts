"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/app-store";

/**
 * Subscribes to /api/sync/stream (SSE) and refreshes the inbox whenever new
 * mail arrives, without the user manually refreshing the browser. Native
 * EventSource reconnects automatically on drops, which doubles as periodic
 * re-authentication (a fresh connection re-reads the session cookie).
 */
export function useRealtimeSync() {
  const authEmail = useAppStore((s) => s.authEmail);

  useEffect(() => {
    if (!authEmail) return;

    const source = new EventSource("/api/sync/stream");

    source.addEventListener("new_mail", () => {
      const store = useAppStore.getState();
      store.bumpNewMailBanner();
      if (store.currentFolder === "inbox") {
        store.refreshCurrentList();
      }
    });

    source.onerror = () => {
      // EventSource retries automatically; nothing to do here beyond letting it.
    };

    return () => source.close();
  }, [authEmail]);
}
