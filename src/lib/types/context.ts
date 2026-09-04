import type { EmailFilters, MailFolder } from "./mail";

export type AppView = "inbox" | "sent" | "email_detail" | "compose";

/**
 * The structured context handed to the AI assistant on every turn.
 *
 * This is deliberately a small, safe projection of app state — not the raw
 * store. It gives the model exactly what it needs to be "context aware"
 * (PDF requirement) without leaking full email bodies or unrelated data.
 */
export interface UIContext {
  currentView: AppView;
  currentFolder: MailFolder;
  currentFilters: EmailFilters;
  /** Present when an email is open in the detail view. */
  openEmail?: {
    id: string;
    threadId: string;
    subject: string;
    from: { name?: string; email: string };
    to: { name?: string; email: string }[];
    /** Short excerpt only — never the full body — to keep the prompt small. */
    snippet: string;
  };
  /** Present when the compose view is open, so the assistant can edit in place. */
  composeDraft?: {
    to: string[];
    subject: string;
    hasBody: boolean;
  };
  /** IDs of emails currently visible in the main list, for "reply to the second one" style follow-ups. */
  visibleEmailIds: string[];
  /**
   * True only immediately after the assistant issued REQUEST_SEND_CONFIRMATION
   * and is awaiting the user's yes/no. The server-side action validator uses
   * this — not the model's own claim — to decide whether a SEND_EMAIL action
   * is allowed through. See src/lib/ai/validate-action.ts.
   */
  sendConfirmationPending: boolean;
}
