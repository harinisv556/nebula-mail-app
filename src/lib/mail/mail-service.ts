import type { Email, EmailFilters, EmailSummary, ComposeDraft } from "@/lib/types/mail";

/**
 * Provider-agnostic mail service contract.
 *
 * The rest of the app (API routes, the app-store, the AI assistant) only
 * ever talks to this interface. `GmailMailService` (gmail-service.ts) is the
 * only file that imports `googleapis`. Swapping in Outlook/Graph later means
 * writing one new class here — nothing else changes.
 */
export interface MailService {
  listEmails(filters: EmailFilters, pageSize?: number): Promise<EmailSummary[]>;
  getEmail(id: string): Promise<Email>;
  sendEmail(draft: ComposeDraft): Promise<{ id: string; threadId: string }>;
  markRead(id: string, isRead: boolean): Promise<void>;
  /** Returns the current Gmail `historyId` — used by the sync layer to detect new mail. */
  getCurrentHistoryId(): Promise<string>;
  /** Lists message IDs added to the mailbox since `historyId`. */
  listNewMessageIdsSince(historyId: string): Promise<{ newMessageIds: string[]; newHistoryId: string }>;
}

export class MailServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "AUTH_EXPIRED"
      | "PROVIDER_ERROR"
      | "NOT_FOUND"
      | "INVALID_INPUT"
      | "NETWORK_ERROR" = "PROVIDER_ERROR",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MailServiceError";
  }
}
