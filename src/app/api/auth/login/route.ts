import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/auth/google";
import { getSession } from "@/lib/auth/session";

/** Kicks off the Google OAuth flow. A random `state` is stored in the session and re-checked in the callback to prevent CSRF. */
export async function GET() {
  try {
    const session = await getSession();
    const state = randomBytes(16).toString("hex");
    session.oauthState = state;
    await session.save();

    const url = getAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start Google sign-in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
