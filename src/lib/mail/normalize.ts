import type { gmail_v1 } from "googleapis";
import type { Attachment, Email, EmailAddress, EmailSummary, MailFolder } from "@/lib/types/mail";
import { MailServiceError } from "./mail-service";

type GmailMessage = gmail_v1.Schema$Message;

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function headerValue(message: GmailMessage, name: string): string | undefined {
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

/** Parses `"Name" <email@x.com>, other@y.com` into structured addresses. */
export function parseAddressList(raw: string | undefined): EmailAddress[] {
  if (!raw) return [];
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "<") depth++;
    if (ch === ">") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)<(.+)>$/);
      if (match) {
        const name = match[1].trim().replace(/^"|"$/g, "");
        return { name: name || undefined, email: match[2].trim() };
      }
      return { email: part };
    });
}

function findBody(part: gmail_v1.Schema$MessagePart | undefined, mimeType: string): string | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findBody(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function findAttachments(part: gmail_v1.Schema$MessagePart | undefined, out: Attachment[] = []): Attachment[] {
  if (!part) return out;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      sizeBytes: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) findAttachments(child, out);
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function folderFromLabels(labelIds: string[] | undefined | null): MailFolder {
  const labels = labelIds ?? [];
  if (labels.includes("TRASH")) return "trash";
  if (labels.includes("DRAFT")) return "drafts";
  if (labels.includes("SENT")) return "sent";
  return "inbox";
}

export function normalizeMessage(message: GmailMessage): Email {
  if (!message.id || !message.threadId) {
    throw new MailServiceError("Malformed Gmail message: missing id/threadId", "PROVIDER_ERROR");
  }

  const htmlBody = findBody(message.payload, "text/html");
  const textBody = findBody(message.payload, "text/plain");
  const bodyText = textBody ?? (htmlBody ? stripHtml(htmlBody) : (message.snippet ?? ""));

  const dateHeader = headerValue(message, "Date");
  const date = dateHeader ? new Date(dateHeader).toISOString() : new Date(Number(message.internalDate ?? 0)).toISOString();

  return {
    id: message.id,
    threadId: message.threadId,
    folder: folderFromLabels(message.labelIds),
    from: parseAddressList(headerValue(message, "From"))[0] ?? { email: "unknown@unknown" },
    to: parseAddressList(headerValue(message, "To")),
    cc: parseAddressList(headerValue(message, "Cc")),
    subject: headerValue(message, "Subject") ?? "(no subject)",
    preview: message.snippet ?? bodyText.slice(0, 160),
    bodyText,
    bodyHtml: htmlBody,
    date,
    isRead: !(message.labelIds ?? []).includes("UNREAD"),
    isStarred: (message.labelIds ?? []).includes("STARRED"),
    attachments: findAttachments(message.payload),
    labels: message.labelIds ?? [],
    messageIdHeader: headerValue(message, "Message-Id"),
  };
}

export function normalizeToSummary(message: GmailMessage): EmailSummary {
  const email = normalizeMessage(message);
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
