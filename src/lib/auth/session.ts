import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { StoredTokens } from "./google";

export interface SessionData {
  tokens?: StoredTokens;
  userEmail?: string;
  /** CSRF-style nonce used to validate the OAuth callback's `state` param. */
  oauthState?: string;
}

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters. See .env.example.",
    );
  }
  return {
    password,
    cookieName: "nebula_mail_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Not authenticated. Please sign in with Google.");
    this.name = "AuthRequiredError";
  }
}

/** Reads the current session's tokens or throws AuthRequiredError. */
export async function requireTokens(): Promise<StoredTokens> {
  const session = await getSession();
  if (!session.tokens) throw new AuthRequiredError();
  return session.tokens;
}
