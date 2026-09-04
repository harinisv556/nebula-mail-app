/**
 * Centralized, credential-safe error logging.
 *
 * Never pass a raw caught error straight to console.error — errors from
 * googleapis/gaxios carry the full request config on `.response.config` or
 * `.config`, including the `Authorization: Bearer <access_token>` header
 * used for that call. Logging the raw object would leak live OAuth tokens
 * into server logs. This extracts just a human-useful message/stack and
 * redacts anything that still looks like a token or auth header.
 */
export function logError(scope: string, err: unknown, level: "error" | "warn" = "error"): void {
  const message = extractSafeMessage(err);
  console[level](`${scope} ${message}`);
}

function extractSafeMessage(err: unknown): string {
  if (err instanceof Error) {
    return redact(err.stack ?? err.message);
  }
  try {
    return redact(JSON.stringify(err));
  } catch {
    return redact(String(err));
  }
}

function redact(text: string): string {
  return text
    .replace(/(access_token|refresh_token|id_token)["':=\s]+[^\s&"',}]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/("Authorization"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"');
}
