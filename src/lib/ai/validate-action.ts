import { AppActionSchema, type AppAction } from "@/lib/types/actions";
import type { UIContext } from "@/lib/types/context";

export type ActionValidationResult =
  | { ok: true; action: AppAction }
  | { ok: false; reason: string; downgradeTo?: AppAction };

/**
 * Re-validates every AI-proposed action, independent of anything the model
 * claims. Two layers:
 *
 *  1. Structural — the payload must match the exact Zod schema for its type
 *     (real email addresses, required fields present, no extra junk).
 *  2. Semantic/authorization — action-specific rules that can't be expressed
 *     in a JSON schema, most importantly: SEND_EMAIL is only ever allowed
 *     immediately after the user confirmed a REQUEST_SEND_CONFIRMATION for
 *     the same recipients/subject. This is the human-in-the-loop safeguard
 *     and it is enforced here, server-side — not by trusting the model.
 */
export function validateAction(rawType: string, rawPayload: unknown, context: UIContext): ActionValidationResult {
  const parsed = AppActionSchema.safeParse({ type: rawType, payload: rawPayload });
  if (!parsed.success) {
    return { ok: false, reason: `Invalid payload for ${rawType}: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  const action = parsed.data;

  if (action.type === "SEND_EMAIL") {
    if (!context.sendConfirmationPending) {
      // The model tried to send without the human-in-the-loop confirmation
      // step having happened. Never execute it — downgrade to a
      // confirmation request with the exact same content instead.
      return {
        ok: false,
        reason: "SEND_EMAIL was rejected because no send confirmation is pending for this session.",
        downgradeTo: { type: "REQUEST_SEND_CONFIRMATION", payload: action.payload },
      };
    }
  }

  return { ok: true, action };
}
