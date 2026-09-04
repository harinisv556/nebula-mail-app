"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

function splitAddresses(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ComposeModal() {
  const composeOpen = useAppStore((s) => s.composeOpen);
  const draft = useAppStore((s) => s.composeDraft);
  const fillCompose = useAppStore((s) => s.fillCompose);
  const closeCompose = useAppStore((s) => s.closeCompose);
  const sendEmail = useAppStore((s) => s.sendEmail);
  const sendStatus = useAppStore((s) => s.sendStatus);
  const sendError = useAppStore((s) => s.sendError);
  const pendingConfirmation = useAppStore((s) => s.pendingConfirmation);
  const confirmSend = useAppStore((s) => s.confirmSend);
  const cancelSendConfirmation = useAppStore((s) => s.cancelSendConfirmation);

  // Local text buffers for the To/Cc inputs (so typing "a, b" doesn't get
  // re-split mid-keystroke), resynced only when draft.to/draft.cc change
  // identity externally (e.g. the assistant calls FILL_COMPOSE) — compared
  // and applied during render per React's "adjusting state" pattern, rather
  // than in an effect, and scoped to `to`/`cc` specifically so editing the
  // subject/body (which changes the draft object's identity too) doesn't
  // clobber in-progress typing in the To/Cc fields.
  const [syncedTo, setSyncedTo] = useState(draft.to);
  const [syncedCc, setSyncedCc] = useState(draft.cc);
  const [toInput, setToInput] = useState(draft.to.join(", "));
  const [ccInput, setCcInput] = useState(draft.cc?.join(", ") ?? "");
  if (syncedTo !== draft.to) {
    setSyncedTo(draft.to);
    setToInput(draft.to.join(", "));
  }
  if (syncedCc !== draft.cc) {
    setSyncedCc(draft.cc);
    setCcInput(draft.cc?.join(", ") ?? "");
  }

  if (!composeOpen) return null;

  const to = splitAddresses(toInput);
  const invalidTo = to.some((addr) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr));
  const canSend = to.length > 0 && !invalidTo && draft.subject.trim().length > 0 && draft.body.trim().length > 0 && sendStatus !== "sending";

  function handleSend() {
    sendEmail({ ...draft, to, cc: splitAddresses(ccInput) || undefined });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-end bg-black/20 p-0 sm:items-end sm:p-6" onClick={closeCompose}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-xl animate-fade-in sm:h-[560px] sm:max-h-[85vh] sm:w-[520px] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">New Message</span>
          <button onClick={closeCompose} aria-label="Close compose" className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {pendingConfirmation && (
          <div className="border-b border-border bg-accent-soft px-4 py-3 text-sm">
            <p className="font-medium text-accent">The assistant prepared this email. Send it?</p>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" size="sm" onClick={confirmSend}>
                Yes, send
              </Button>
              <Button variant="secondary" size="sm" onClick={cancelSendConfirmation}>
                No, keep editing
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-0 border-b border-border">
          <input
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            placeholder="To"
            className="border-b border-border px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <input
            value={ccInput}
            onChange={(e) => setCcInput(e.target.value)}
            placeholder="Cc (optional)"
            className="border-b border-border px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <input
            value={draft.subject}
            onChange={(e) => fillCompose({ subject: e.target.value })}
            placeholder="Subject"
            className="px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
        </div>

        <textarea
          value={draft.body}
          onChange={(e) => fillCompose({ body: e.target.value })}
          placeholder="Write your message..."
          className="flex-1 resize-none px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
        />

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs">
            {sendStatus === "error" && (
              <span className="flex items-center gap-1 text-danger">
                <AlertCircle className="h-3.5 w-3.5" /> {sendError}
              </span>
            )}
            {sendStatus === "sent" && (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sent!
              </span>
            )}
            {invalidTo && to.length > 0 && <span className="text-danger">Check the recipient address(es).</span>}
          </div>
          <Button variant="primary" onClick={handleSend} disabled={!canSend}>
            {sendStatus === "sending" ? <Spinner className="h-4 w-4" /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
