import type { ComposeDraft, Email, EmailAddress } from "@/lib/types/mail";

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function quoteOriginal(email: Email): string {
  const when = new Date(email.date).toLocaleString();
  const quoted = email.bodyText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `On ${when}, ${formatAddress(email.from)} wrote:\n${quoted}`;
}

/** Builds a reply draft from the original email — same logic whether triggered by a UI click or the assistant. */
export function buildReplyDraft(email: Email, draftBody?: string): ComposeDraft {
  const subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  const body = draftBody ? `${draftBody}\n\n${quoteOriginal(email)}` : `\n\n${quoteOriginal(email)}`;
  return {
    to: [email.from.email],
    subject,
    body,
    threadId: email.threadId,
    inReplyTo: email.messageIdHeader,
  };
}

/** Builds a forward draft from the original email. `to` is optional — the assistant/user may not have specified a recipient yet. */
export function buildForwardDraft(email: Email, to: string[] = [], draftBody?: string): ComposeDraft {
  const subject = /^fwd:/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`;
  const header = [
    "---------- Forwarded message ---------",
    `From: ${formatAddress(email.from)}`,
    `Date: ${new Date(email.date).toLocaleString()}`,
    `Subject: ${email.subject}`,
    `To: ${email.to.map(formatAddress).join(", ")}`,
  ].join("\n");
  const body = `${draftBody ? `${draftBody}\n\n` : ""}${header}\n\n${email.bodyText}`;
  return { to, subject, body };
}
