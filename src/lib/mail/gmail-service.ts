import { gmail_v1, google } from "googleapis";
import type { GaxiosError } from "gaxios";
import { authorizedClient, type StoredTokens } from "@/lib/auth/google";
import type { ComposeDraft, Email, EmailFilters, EmailSummary } from "@/lib/types/mail";
import { buildGmailQuery } from "./query-builder";
import { MailServiceError, type MailService } from "./mail-service";
import { normalizeMessage, normalizeToSummary, parseAddressList } from "./normalize";

/**
 * Gmail implementation of {@link MailService}. This is the only file allowed
 * to talk to `googleapis` directly — everything else in the app works with
 * the normalized `Email` / `EmailSummary` types.
 */
export class GmailMailService implements MailService {
  private readonly gmail: gmail_v1.Gmail;
  private latestTokens: StoredTokens;

  constructor(tokens: StoredTokens) {
    this.latestTokens = tokens;
    const auth = authorizedClient(tokens);
    // googleapis refreshes expired access tokens automatically when a
    // refresh_token is present; capture the refreshed token so the caller
    // can persist it back into the session cookie.
    auth.on("tokens", (newTokens) => {
      this.latestTokens = {
        accessToken: newTokens.access_token ?? this.latestTokens.accessToken,
        refreshToken: newTokens.refresh_token ?? this.latestTokens.refreshToken,
        expiryDate: newTokens.expiry_date ?? this.latestTokens.expiryDate,
      };
    });
    this.gmail = google.gmail({ version: "v1", auth });
  }

  /** Call after any operation to get tokens that may have been refreshed mid-request. */
  getLatestTokens(): StoredTokens {
    return this.latestTokens;
  }

  async listEmails(filters: EmailFilters, pageSize = 25): Promise<EmailSummary[]> {
    try {
      const query = buildGmailQuery(filters);
      const list = await this.gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: pageSize,
      });
      const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
      if (ids.length === 0) return [];

      const messages = await Promise.all(
        ids.map((id) =>
          this.gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "To", "Cc", "Subject", "Date"] }),
        ),
      );
      return messages.map((m) => normalizeToSummary(m.data));
    } catch (err) {
      throw toMailServiceError(err, "Failed to list emails");
    }
  }

  async getEmail(id: string): Promise<Email> {
    try {
      const res = await this.gmail.users.messages.get({ userId: "me", id, format: "full" });
      return normalizeMessage(res.data);
    } catch (err) {
      throw toMailServiceError(err, `Failed to load email ${id}`);
    }
  }

  async sendEmail(draft: ComposeDraft): Promise<{ id: string; threadId: string }> {
    try {
      const raw = buildRawMessage(draft);
      const res = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: draft.threadId,
        },
      });
      if (!res.data.id || !res.data.threadId) {
        throw new MailServiceError("Gmail did not return a message id for the sent email.", "PROVIDER_ERROR");
      }
      return { id: res.data.id, threadId: res.data.threadId };
    } catch (err) {
      throw toMailServiceError(err, "Failed to send email");
    }
  }

  async markRead(id: string, isRead: boolean): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: isRead ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
      });
    } catch (err) {
      throw toMailServiceError(err, `Failed to update read state for ${id}`);
    }
  }

  async getCurrentHistoryId(): Promise<string> {
    try {
      const profile = await this.gmail.users.getProfile({ userId: "me" });
      if (!profile.data.historyId) {
        throw new MailServiceError("Gmail profile did not include a historyId.", "PROVIDER_ERROR");
      }
      return profile.data.historyId;
    } catch (err) {
      throw toMailServiceError(err, "Failed to read mailbox history id");
    }
  }

  /**
   * Registers this mailbox for Gmail push notifications via Pub/Sub.
   * Optional/production-path feature — requires a GCP Pub/Sub topic granted
   * publish rights to gmail-api-push@system.gserviceaccount.com. Not part of
   * the {@link MailService} interface since it's Gmail-specific and requires
   * infrastructure most local setups won't have; see README "Real-Time
   * Synchronization". The watch expires after ~7 days and must be renewed.
   */
  async watchMailbox(topicName: string): Promise<{ historyId: string; expiration: string }> {
    try {
      const res = await this.gmail.users.watch({
        userId: "me",
        requestBody: { topicName, labelIds: ["INBOX"], labelFilterAction: "include" },
      });
      if (!res.data.historyId || !res.data.expiration) {
        throw new MailServiceError("Gmail did not return historyId/expiration for the watch request.", "PROVIDER_ERROR");
      }
      return { historyId: res.data.historyId, expiration: res.data.expiration };
    } catch (err) {
      throw toMailServiceError(err, "Failed to register Gmail push notifications");
    }
  }

  async stopWatch(): Promise<void> {
    try {
      await this.gmail.users.stop({ userId: "me" });
    } catch (err) {
      throw toMailServiceError(err, "Failed to stop Gmail push notifications");
    }
  }

  async listNewMessageIdsSince(historyId: string): Promise<{ newMessageIds: string[]; newHistoryId: string }> {
    try {
      const res = await this.gmail.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: ["messageAdded"],
      });
      const ids = new Set<string>();
      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id && (added.message.labelIds ?? []).includes("INBOX")) {
            ids.add(added.message.id);
          }
        }
      }
      return {
        newMessageIds: [...ids],
        newHistoryId: res.data.historyId ?? historyId,
      };
    } catch (err) {
      const gaxiosErr = err as GaxiosError;
      // A 404 means the historyId is too old (expired) — the caller should
      // fall back to a full resync from the current historyId.
      if (gaxiosErr?.response?.status === 404) {
        throw new MailServiceError("History id expired; full resync required.", "NOT_FOUND", err);
      }
      throw toMailServiceError(err, "Failed to list mailbox history");
    }
  }
}

function toMailServiceError(err: unknown, message: string): MailServiceError {
  const gaxiosErr = err as GaxiosError;
  const status = gaxiosErr?.response?.status;
  if (status === 401) return new MailServiceError(`${message}: authentication expired`, "AUTH_EXPIRED", err);
  if (status === 404) return new MailServiceError(`${message}: not found`, "NOT_FOUND", err);
  if (status === 400) return new MailServiceError(`${message}: invalid request`, "INVALID_INPUT", err);
  if (!status) return new MailServiceError(`${message}: network error`, "NETWORK_ERROR", err);
  return new MailServiceError(message, "PROVIDER_ERROR", err);
}

function encodeHeaderValue(value: string): string {
  // Encode non-ASCII subject/name text per RFC 2047 so Gmail renders it correctly.
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(draft: ComposeDraft): string {
  const headers = [
    `To: ${draft.to.join(", ")}`,
    draft.cc?.length ? `Cc: ${draft.cc.join(", ")}` : undefined,
    `Subject: ${encodeHeaderValue(draft.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    draft.inReplyTo ? `In-Reply-To: ${draft.inReplyTo}` : undefined,
    draft.inReplyTo ? `References: ${draft.inReplyTo}` : undefined,
  ].filter(Boolean);

  const message = `${headers.join("\r\n")}\r\n\r\n${draft.body}`;
  return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export { parseAddressList };
