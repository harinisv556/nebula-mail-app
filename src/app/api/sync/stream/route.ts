import { getSession } from "@/lib/auth/session";
import { logError } from "@/lib/log-safe";
import { GmailMailService } from "@/lib/mail/gmail-service";
import { MailServiceError } from "@/lib/mail/mail-service";
import { onWake } from "@/lib/sync/event-bus";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
/** Cap connection lifetime; the client's EventSource auto-reconnects, which also
 * picks up any refreshed OAuth token that another request may have persisted. */
const MAX_CONNECTION_MS = 20 * 60 * 1000;

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Real-time-ish inbox sync via Server-Sent Events.
 *
 * Primary mechanism: this handler polls Gmail's history API on an interval
 * and pushes a `new_mail` event to the browser when new inbox messages
 * appear — no manual refresh needed. This is honestly a short-interval poll
 * dressed as push on the Gmail side, pushed to the browser via real SSE.
 *
 * Secondary mechanism (used when configured): /api/webhooks/gmail-pubsub
 * wakes this loop immediately via the in-process event bus when Gmail's own
 * push notification arrives, so the optional Pub/Sub path just lowers
 * latency on top of the same polling logic — it never replaces the fallback.
 * See README "Real-Time Synchronization" for the full trade-off writeup.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.tokens || !session.userEmail) {
    return new Response("Not authenticated", { status: 401 });
  }
  const userEmail = session.userEmail;
  const service = new GmailMailService(session.tokens);

  let cursorHistoryId: string;
  try {
    cursorHistoryId = await service.getCurrentHistoryId();
  } catch (err) {
    logError("[sync/stream] failed to establish starting historyId:", err);
    return new Response("Failed to start sync", { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseLine(event, data)));
        } catch {
          closed = true;
        }
      };

      send("ready", { historyId: cursorHistoryId });

      const checkForNewMail = async () => {
        try {
          const { newMessageIds, newHistoryId } = await service.listNewMessageIdsSince(cursorHistoryId);
          cursorHistoryId = newHistoryId;
          if (newMessageIds.length > 0) {
            send("new_mail", { count: newMessageIds.length });
          }
        } catch (err) {
          if (err instanceof MailServiceError && err.code === "NOT_FOUND") {
            // historyId expired (Gmail retains ~7 days of history) — resync
            // from "now" rather than erroring the whole connection.
            console.warn(`[sync/stream] historyId expired for ${userEmail}; resyncing`);
            try {
              cursorHistoryId = await service.getCurrentHistoryId();
            } catch (resyncErr) {
              logError("[sync/stream] resync failed:", resyncErr);
            }
            return;
          }
          logError("[sync/stream] poll failed:", err);
          send("sync_error", { message: "Temporarily unable to check for new mail." });
        }
      };

      const pollTimer = setInterval(checkForNewMail, POLL_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);
      const unsubscribeWake = onWake(userEmail, () => void checkForNewMail());
      const maxLifetimeTimer = setTimeout(() => {
        closed = true;
        cleanup();
        controller.close();
      }, MAX_CONNECTION_MS);

      function cleanup() {
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        clearTimeout(maxLifetimeTimer);
        unsubscribeWake();
      }

      request.signal.addEventListener("abort", () => {
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
