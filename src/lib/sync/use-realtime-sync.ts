"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/app-store";

/** The minimal shape we depend on from EventSource — lets tests inject a fake source without a real browser. */
export interface MinimalEventSource {
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
}

/**
 * Wires a single SSE connection's events to the store. Extracted from the
 * `useRealtimeSync` hook below so the actual event-handling logic — what a
 * `new_mail`/`sync_error`/`ready` event does to app state — can be unit
 * tested directly against a fake event source, without mounting React or a
 * real EventSource/browser.
 */
export function attachRealtimeSyncListeners(source: MinimalEventSource): void {
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
      const data = JSON.parse(event.data);
      useAppStore.getState().setSyncError(data?.message ?? "Live updates are temporarily unavailable.");
    } catch {
      useAppStore.getState().setSyncError("Live updates are temporarily unavailable.");
    }
  });

  source.addEventListener("ready", () => {
    useAppStore.getState().setSyncError(null);
  });
}

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
    attachRealtimeSyncListeners(source);

    source.onerror = () => {
      // EventSource retries automatically. A dropped connection isn't
      // itself a sync failure — the SSE spec's own reconnect handles it —
      // so we don't surface every transient drop as an error.
    };

    return () => source.close();
  }, [authEmail]);
}
