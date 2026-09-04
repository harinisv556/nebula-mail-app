/**
 * Provider-agnostic mail domain models.
 *
 * Nothing in the rest of the app (UI, store, AI assistant) should ever see a
 * raw Gmail API shape — everything is normalized into these types by the
 * mail-service layer (see src/lib/mail/normalize.ts). This is what makes it
 * possible to swap Gmail for another provider later without touching the UI.
 */

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type MailFolder = "inbox" | "sent" | "drafts" | "trash";

/** A single email message, normalized from the provider's raw format. */
export interface Email {
  id: string;
  threadId: string;
  folder: MailFolder;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  /** Plain-text preview snippet (1-2 lines), used in list views. */
  preview: string;
  /** Full plain-text body. */
  bodyText: string;
  /** Full HTML body, if available. Sanitized before being sent to the client. */
  bodyHtml?: string;
  date: string; // ISO 8601
  isRead: boolean;
  isStarred: boolean;
  attachments: Attachment[];
  labels: string[];
  /** RFC 2822 `Message-ID` header — used for proper In-Reply-To/References threading, not for display. */
  messageIdHeader?: string;
}

/** A thread groups messages that share a conversation (bonus: thread view). */
export interface EmailThread {
  id: string;
  subject: string;
  messageCount: number;
  participants: EmailAddress[];
  lastMessageDate: string;
  isRead: boolean;
  messages: Email[];
}

/** Lightweight summary used in list views — avoids shipping full bodies. */
export interface EmailSummary {
  id: string;
  threadId: string;
  folder: MailFolder;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  preview: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

export function toSummary(email: Email): EmailSummary {
  return {
    id: email.id,
    threadId: email.threadId,
    folder: email.folder,
    from: email.from,
    to: email.to,
    subject: email.subject,
    preview: email.preview,
    date: email.date,
    isRead: email.isRead,
    isStarred: email.isStarred,
    hasAttachments: email.attachments.length > 0,
  };
}

/** Relative date-range shorthand supported by both UI controls and the assistant. */
export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_7_days"
  | "last_10_days"
  | "last_30_days"
  | "this_month"
  | "all_time";

export interface EmailFilters {
  folder: MailFolder;
  /** Free-text keyword search across subject/body/sender. */
  keyword?: string;
  /** Sender name or email substring. */
  sender?: string;
  unreadOnly?: boolean;
  dateRange?: DateRangePreset;
  /** Explicit date bounds, used when a preset isn't precise enough. */
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
}

export const DEFAULT_FILTERS: EmailFilters = {
  folder: "inbox",
};

export interface ComposeDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Set when composing a reply — the message being replied to. */
  inReplyTo?: string;
  /** Set when composing a forward — the message being forwarded. */
  forwardOf?: string;
  threadId?: string;
}

export const EMPTY_DRAFT: ComposeDraft = { to: [], subject: "", body: "" };
