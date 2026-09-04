import { Paperclip, Star } from "lucide-react";
import type { EmailSummary } from "@/lib/types/mail";

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export function EmailListItem({ email, active, onClick }: { email: EmailSummary; active: boolean; onClick: () => void }) {
  const party = email.folder === "sent" ? email.to[0] : email.from;
  const label = party?.name ?? party?.email ?? "(unknown)";

  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors ${
        active ? "bg-accent-soft" : "hover:bg-surface-2"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-sm ${!email.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>{label}</span>
        <span className="shrink-0 text-[11px] text-muted">{formatDate(email.date)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {!email.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
        <span className={`truncate text-sm ${!email.isRead ? "font-medium text-foreground" : "text-foreground/70"}`}>{email.subject}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="truncate">{email.preview}</span>
        {email.hasAttachments && <Paperclip className="h-3 w-3 shrink-0" />}
        {email.isStarred && <Star className="h-3 w-3 shrink-0 fill-current" />}
      </div>
    </button>
  );
}
