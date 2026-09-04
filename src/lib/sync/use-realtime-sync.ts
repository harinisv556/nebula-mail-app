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
      store.setSyncError(null);
      if (store.currentFolder === "inbox") {
        store.refreshCurrentList();
      }
    });

    source.addEventListener("sync_error", (event) => {
      // The server already retries on its own poll interval — this is
      // surfaced as a subtle, non-blocking indicator, not an error banner
      // that would interrupt reading mail over a transient hiccup.
      try {
        const data = JSON.parse((event as MessageEvent).data);
        useAppStore.getState().setSyncError(data?.message ?? "Live updates are temporarily unavailable.");
      } catch {
        useAppStore.getState().setSyncError("Live updates are temporarily unavailable.");
      }
    });

    source.addEventListener("ready", () => {
      useAppStore.getState().setSyncError(null);
    });

    source.onerror = () => {
      // EventSource retries automatically. A dropped connection isn't
      // itself a sync failure — the SSE spec's own reconnect handles it —
      // so we don't surface every transient drop as an error.
    };

    return () => source.close();
  }, [authEmail]);
}
