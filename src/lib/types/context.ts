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
   * Set only immediately after the assistant issued REQUEST_SEND_CONFIRMATION
   * and the user hasn't yet acted on it. Carries a hash of the exact payload
   * that was shown to the user (see src/lib/mail/canonical-payload.ts) and an
   * expiry timestamp — the server-side action validator uses this binding
   * (not just presence, and not the model's own claim) to decide whether a
   * later SEND_EMAIL action may proceed: it must match the approved payload
   * exactly and must not have expired. See src/lib/ai/validate-action.ts.
   */
  pendingSendConfirmation: { payloadHash: string; expiresAt: number } | null;
}
