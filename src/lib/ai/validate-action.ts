import { AppActionSchema, type AppAction } from "@/lib/types/actions";
import type { UIContext } from "@/lib/types/context";
import { hashEmailPayload } from "@/lib/mail/canonical-payload";

export type ActionValidationResult =
  | { ok: true; action: AppAction }
  | { ok: false; reason: string; downgradeTo?: AppAction };

/**
 * Re-validates every AI-proposed action, independent of anything the model
 * claims. Three layers:
 *
 *  1. Structural — the payload must match the exact Zod schema for its type
 *     (real email addresses, required fields present, no extra junk).
 *  2. Presence + freshness — SEND_EMAIL requires a `pendingSendConfirmation`
 *     on the context, and it must not have expired (see
 *     canonical-payload.ts's SEND_CONFIRMATION_TTL_MS).
 *  3. Content binding — the SEND_EMAIL payload's canonical hash must exactly
 *     match the hash that was computed when REQUEST_SEND_CONFIRMATION was
 *     shown to the user. A confirmation for one email can never authorize
 *     sending a *different* one, even if some confirmation happens to be
 *     pending. This is the human-in-the-loop safeguard, enforced here,
 *     server-side — never by trusting the model.
 *
 * Note on trust boundary: `context` is reported by the client, so this is a
 * resilience mechanism against the assistant/model sending something other
 * than what the user actually approved within a legitimate session — not a
 * defense against a client that has already authenticated as the victim
 * (that boundary is the session cookie; see src/lib/auth/session.ts). A
 * caller who already holds the user's session could call /api/mail/send
 * directly regardless of this check.
 */
export async function validateAction(rawType: string, rawPayload: unknown, context: UIContext): Promise<ActionValidationResult> {
  const parsed = AppActionSchema.safeParse({ type: rawType, payload: rawPayload });
  if (!parsed.success) {
    return { ok: false, reason: `Invalid payload for ${rawType}: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  const action = parsed.data;

  if (action.type === "SEND_EMAIL") {
    const pending = context.pendingSendConfirmation;

    if (!pending) {
      // No confirmation was ever requested for this session — never send on
      // an ambiguous or first-time ask. Downgrade to a confirmation request
      // with the exact same content instead.
      return {
        ok: false,
        reason: "SEND_EMAIL was rejected because no send confirmation is pending for this session.",
        downgradeTo: { type: "REQUEST_SEND_CONFIRMATION", payload: action.payload },
      };
    }

    if (Date.now() > pending.expiresAt) {
      return {
        ok: false,
        reason: "SEND_EMAIL was rejected because the pending send confirmation has expired.",
        downgradeTo: { type: "REQUEST_SEND_CONFIRMATION", payload: action.payload },
      };
    }

    const actualHash = await hashEmailPayload(action.payload);
    if (actualHash !== pending.payloadHash) {
      // The email being sent isn't the one the user approved — reject
      // outright and require a fresh confirmation for the new content.
      return {
        ok: false,
        reason: "SEND_EMAIL was rejected because its content does not match the email the user confirmed.",
        downgradeTo: { type: "REQUEST_SEND_CONFIRMATION", payload: action.payload },
      };
    }
  }

  return { ok: true, action };
}
