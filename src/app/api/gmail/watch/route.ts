import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-error";
import { withMailService } from "@/lib/mail/with-mail-service";

/**
 * Registers (or renews) a Gmail push-notification watch for the signed-in
 * user. Optional — only works when GOOGLE_PUBSUB_TOPIC is configured and the
 * app is reachable at a public HTTPS URL (see README). Without this, the app
 * still gets near-real-time updates via the polling+SSE fallback in
 * /api/sync/stream — this just lowers latency and demonstrates the
 * production-grade path the PDF references.
 */
export async function POST() {
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    return NextResponse.json(
      { error: "not_configured", message: "GOOGLE_PUBSUB_TOPIC is not set — real-time sync is running on the polling fallback instead." },
      { status: 501 },
    );
  }

  try {
    const result = await withMailService((service) => service.watchMailbox(topicName));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
