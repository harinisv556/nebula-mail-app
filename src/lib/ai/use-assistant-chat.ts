"use client";

import { useCallback } from "react";
import { useAppStore, nextMessageId } from "@/lib/store/app-store";
import { AppActionSchema, type AppAction } from "@/lib/types/actions";
import { dispatchActions } from "./dispatch-actions";
import { summarizeAction } from "./action-summary";

interface AssistantApiResponse {
  reply: string;
  actions: unknown[];
  rejections: { type: string; reason: string }[];
  emailPreviews: { id: string; from: string; subject: string; date: string; preview: string }[];
}

/** Drives the assistant panel: sends the user's message + current UI context, then dispatches whatever validated actions come back through the shared action layer. */
export function useAssistantChat() {
  const pushAssistantMessage = useAppStore((s) => s.pushAssistantMessage);
  const setAssistantBusy = useAppStore((s) => s.setAssistantBusy);

  const send = useCallback(
    async (message: string) => {
      const store = useAppStore.getState();
      pushAssistantMessage({ id: nextMessageId(), role: "user", text: message });
      setAssistantBusy(true);

      try {
        const history = store.assistantMessages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, context: store.getUIContext(), history }),
        });
        const data = await res.json();

        if (!res.ok) {
          pushAssistantMessage({ id: nextMessageId(), role: "assistant", text: data?.message || "Something went wrong.", isError: true });
          return;
        }

        const payload = data as AssistantApiResponse;
        const actions: AppAction[] = [];
        for (const raw of payload.actions) {
          const parsed = AppActionSchema.safeParse(raw);
          if (parsed.success) actions.push(parsed.data);
        }

        await dispatchActions(actions);

        pushAssistantMessage({
          id: nextMessageId(),
          role: "assistant",
          text: payload.reply,
          actions: actions.map((a) => ({ type: a.type, summary: summarizeAction(a) })),
          previews: payload.emailPreviews?.length ? payload.emailPreviews : undefined,
        });
      } catch {
        pushAssistantMessage({ id: nextMessageId(), role: "assistant", text: "Couldn't reach the assistant. Please try again.", isError: true });
      } finally {
        setAssistantBusy(false);
      }
    },
    [pushAssistantMessage, setAssistantBusy],
  );

  return { send };
}
