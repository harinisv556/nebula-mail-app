/**
 * Canonicalization + hashing for the email payload behind a send
 * confirmation. This is what binds "the user approved sending X" to "the
 * assistant is now asking to actually send Y" — see validate-action.ts.
 *
 * Uses the Web Crypto API (`crypto.subtle`), which is available as a global
 * in both the browser and the Node.js runtime Next.js API routes run on, so
 * the exact same function produces the exact same hash on both sides of the
 * client/server boundary without any environment-specific code.
 */

export interface CanonicalizableEmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Included so a reply/forward's threading is part of what's approved, not silently dropped or swapped. */
  threadId?: string;
  inReplyTo?: string;
}

/** How long a send confirmation stays valid before it must be re-issued. */
export const SEND_CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function normalizeAddressList(list?: string[]): string[] {
  return (list ?? [])
    .map((addr) => addr.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function normalizeText(value: string): string {
  // Trim and normalize line endings so incidental whitespace differences
  // (e.g. \r\n introduced by a form field) don't produce a different hash
  // for what is semantically the same email.
  return value.trim().replace(/\r\n/g, "\n");
}

/** Deterministic JSON representation of an email payload, independent of field order, casing, or incidental whitespace. */
export function canonicalizeEmailPayload(payload: CanonicalizableEmailPayload): string {
  return JSON.stringify({
    to: normalizeAddressList(payload.to),
    cc: normalizeAddressList(payload.cc),
    bcc: normalizeAddressList(payload.bcc),
    subject: normalizeText(payload.subject),
    body: normalizeText(payload.body),
    threadId: payload.threadId ?? null,
    inReplyTo: payload.inReplyTo ?? null,
  });
}

/** SHA-256 hex digest of the canonical payload. */
export async function hashEmailPayload(payload: CanonicalizableEmailPayload): Promise<string> {
  const canonical = canonicalizeEmailPayload(payload);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
