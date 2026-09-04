"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { useAssistantChat } from "@/lib/ai/use-assistant-chat";
import { MessageBubble } from "./MessageBubble";
import { Spinner } from "@/components/ui/Spinner";

const SUGGESTIONS = [
  "Show me emails from the last 10 days",
  "Show only unread emails from this week",
  "Compose an email to john@example.com about tomorrow's meeting",
];

export function AssistantPanel() {
  const messages = useAppStore((s) => s.assistantMessages);
  const busy = useAppStore((s) => s.assistantBusy);
  const { send } = useAssistantChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setInput("");
    send(trimmed);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface xl:w-96">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <Bot className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-foreground">Assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-3 px-1 pt-2">
            <p className="text-xs text-muted">
              Tell me what to do — I can compose emails, search your inbox, apply filters, open specific emails, and prepare replies. I&apos;ll always
              show you what I&apos;m doing in the app itself.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted">
            <Spinner className="h-3.5 w-3.5" /> Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant..."
          disabled={busy}
          className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition-opacity disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}
