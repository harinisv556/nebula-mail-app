import { getSession, AuthRequiredError } from "@/lib/auth/session";
import { GmailMailService } from "./gmail-service";

/**
 * Loads the current session's Gmail tokens, runs `fn` against a fresh
 * `GmailMailService`, and persists any refreshed access token back into the
 * session cookie afterward. Every mail-related API route should go through
 * this instead of touching the session/service directly.
 */
export async function withMailService<T>(fn: (service: GmailMailService) => Promise<T>): Promise<T> {
  const session = await getSession();
  if (!session.tokens) throw new AuthRequiredError();

  const service = new GmailMailService(session.tokens);
  try {
    return await fn(service);
  } finally {
    const latest = service.getLatestTokens();
    if (latest.accessToken !== session.tokens.accessToken || latest.expiryDate !== session.tokens.expiryDate) {
      session.tokens = latest;
      await session.save();
    }
  }
}
