"use client";

import { ArrowLeft, Forward, Paperclip, Reply } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

function formatAddress(addr: { name?: string; email: string }): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

export function EmailDetail() {
  const email = useAppStore((s) => s.openEmail);
  const loading = useAppStore((s) => s.openEmailLoading);
  const error = useAppStore((s) => s.openEmailError);
  const closeEmail = useAppStore((s) => s.closeEmail);
  const prepareReply = useAppStore((s) => s.prepareReply);
  const prepareForward = useAppStore((s) => s.prepareForward);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5 text-muted" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Couldn't load this email" description={error} />;
  }

  if (!email) {
    return <EmptyState title="Select an email to read it" />;
  }

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={closeEmail} aria-label="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => prepareReply(email.id)}>
          <Reply className="h-3.5 w-3.5" /> Reply
        </Button>
        <Button variant="secondary" size="sm" onClick={() => prepareForward(email.id)}>
          <Forward className="h-3.5 w-3.5" /> Forward
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <h1 className="text-lg font-semibold text-foreground">{email.subject}</h1>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">{formatAddress(email.from)}</p>
            <p className="text-xs text-muted">to {email.to.map(formatAddress).join(", ")}</p>
          </div>
          <span className="shrink-0 text-xs text-muted">{new Date(email.date).toLocaleString()}</span>
        </div>

        {email.attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {email.attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted">
                <Paperclip className="h-3 w-3" /> {a.filename}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{email.bodyText}</div>
      </div>
    </div>
  );
}
