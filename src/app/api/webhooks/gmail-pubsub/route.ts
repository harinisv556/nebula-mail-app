import { NextRequest, NextResponse } from "next/server";
import { notifyPossibleNewMail } from "@/lib/sync/event-bus";

interface PubSubPushBody {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

/**
 * Receives Gmail's Pub/Sub push notifications (configured via
 * gmail.users.watch, see /api/gmail/watch). This is the "real push"
 * mechanism the PDF references — it requires a public HTTPS URL, which is
 * why it's optional in local dev (use ngrok to test it end-to-end; see
 * README). It never computes the actual mail diff itself — it just wakes
 * the matching user's SSE stream, which re-checks Gmail's history API using
 * that user's own credentials. This keeps Gmail tokens out of the webhook
 * entirely and means a misconfigured/spoofed webhook call can, at worst,
 * trigger a spurious (harmless, read-only) history check.
 */
export async function POST(request: NextRequest) {
  const expectedToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
  if (expectedToken) {
    const token = request.nextUrl.searchParams.get("token");
    if (token !== expectedToken) {
      console.warn("[webhooks/gmail-pubsub] rejected request with invalid verification token");
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
  }

  let body: PubSubPushBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "malformed_body" }, { status: 400 });
  }

  const data = body.message?.data;
  if (!data) {
    // Ack anyway — Pub/Sub retries on non-2xx, and a missing payload isn't recoverable by retrying.
    return NextResponse.json({ ok: true });
  }

  try {
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { emailAddress?: string; historyId?: string | number };
    if (parsed.emailAddress) {
      notifyPossibleNewMail(parsed.emailAddress);
    }
  } catch (err) {
    console.error("[webhooks/gmail-pubsub] failed to parse push payload:", err);
    // Still ack — a malformed payload will never succeed on retry either.
  }

  return NextResponse.json({ ok: true });
}
