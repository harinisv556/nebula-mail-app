import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "@/lib/auth/session";
import { MailServiceError } from "@/lib/mail/mail-service";
import { logError } from "@/lib/log-safe";

/**
 * Central error -> HTTP response mapping for API routes. Keeps the message
 * shown to the client understandable without leaking stack traces, tokens,
 * or provider internals — full detail still goes to server logs.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthRequiredError) {
    return NextResponse.json({ error: "auth_required", message: "Please sign in with Google to continue." }, { status: 401 });
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "invalid_input", message: "Request payload failed validation.", details: err.issues },
      { status: 400 },
    );
  }

  if (err instanceof MailServiceError) {
    logError(`[mail] ${err.code}:`, err.cause ?? err.message);
    const status = { AUTH_EXPIRED: 401, NOT_FOUND: 404, INVALID_INPUT: 400, NETWORK_ERROR: 502, PROVIDER_ERROR: 502 }[err.code];
    const message = {
      AUTH_EXPIRED: "Your Google session has expired. Please sign in again.",
      NOT_FOUND: "The requested email could not be found.",
      INVALID_INPUT: "The request was invalid.",
      NETWORK_ERROR: "Could not reach Gmail. Check your connection and try again.",
      PROVIDER_ERROR: "Gmail returned an unexpected error. Please try again.",
    }[err.code];
    return NextResponse.json({ error: err.code.toLowerCase(), message }, { status });
  }

  if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
    console.error("[assistant] missing ANTHROPIC_API_KEY");
    return NextResponse.json(
      { error: "assistant_unconfigured", message: "The AI assistant isn't configured yet — missing ANTHROPIC_API_KEY on the server." },
      { status: 503 },
    );
  }

  logError("[api] unhandled error:", err);
  return NextResponse.json({ error: "internal_error", message: "Something went wrong. Please try again." }, { status: 500 });
}
