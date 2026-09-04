import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const POLL_INTERVAL_MS = 15_000;

const sessionState: { tokens: unknown; userEmail: string | undefined } = {
  tokens: { accessToken: "a", refreshToken: "r", expiryDate: Date.now() + 3600_000 },
  userEmail: "user@example.com",
};

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ tokens: sessionState.tokens, userEmail: sessionState.userEmail })),
}));

const gmailServiceInstance = vi.hoisted(() => ({
  getCurrentHistoryId: vi.fn(),
  listNewMessageIdsSince: vi.fn(),
}));

vi.mock("@/lib/mail/gmail-service", () => ({
  GmailMailService: vi.fn(function GmailMailService() {
    return gmailServiceInstance;
  }),
}));

// The real event bus (independently unit tested in event-bus.test.ts) — used
// here, not mocked, so we can prove the SSE route genuinely wires itself up
// to notifyPossibleNewMail(), end to end.
const { GET } = await import("@/app/api/sync/stream/route");
const { MailServiceError } = await import("@/lib/mail/mail-service");
const { notifyPossibleNewMail } = await import("@/lib/sync/event-bus");

const decoder = new TextDecoder();

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  if (done) return "";
  return decoder.decode(value);
}

/** Reads chunks until one matches the given SSE event name (skips heartbeats/other events), or gives up after a bounded number of reads. */
async function readUntilEvent(reader: ReadableStreamDefaultReader<Uint8Array>, eventName: string, maxReads = 5): Promise<string> {
  for (let i = 0; i < maxReads; i++) {
    const chunk = await readChunk(reader);
    if (chunk.includes(`event: ${eventName}`)) return chunk;
  }
  throw new Error(`Did not see an "${eventName}" event within ${maxReads} reads`);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.tokens = { accessToken: "a", refreshToken: "r", expiryDate: Date.now() + 3600_000 };
  sessionState.userEmail = "user@example.com";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/sync/stream — authentication", () => {
  it("rejects with 401 when there is no session", async () => {
    sessionState.tokens = undefined;
    sessionState.userEmail = undefined;

    const res = await GET(new Request("http://localhost/api/sync/stream"));

    expect(res.status).toBe(401);
  });
});

describe("GET /api/sync/stream — new-mail propagation", () => {
  it("sends a ready event immediately, then a new_mail event once the poll finds new messages", async () => {
    vi.useFakeTimers();
    gmailServiceInstance.getCurrentHistoryId.mockResolvedValue("100");
    gmailServiceInstance.listNewMessageIdsSince.mockResolvedValue({ newMessageIds: ["a", "b"], newHistoryId: "101" });

    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/sync/stream", { signal: controller.signal }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const readyChunk = await readChunk(reader);
    expect(readyChunk).toContain("event: ready");
    expect(readyChunk).toContain('"historyId":"100"');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    const newMailChunk = await readUntilEvent(reader, "new_mail");
    expect(newMailChunk).toContain('"count":2');
    expect(gmailServiceInstance.listNewMessageIdsSince).toHaveBeenCalledWith("100");

    controller.abort();
  });

  it("propagates a wake signal from the event bus immediately, without waiting for the next poll tick", async () => {
    vi.useFakeTimers();
    gmailServiceInstance.getCurrentHistoryId.mockResolvedValue("100");
    gmailServiceInstance.listNewMessageIdsSince.mockResolvedValue({ newMessageIds: ["a"], newHistoryId: "101" });

    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/sync/stream", { signal: controller.signal }));
    const reader = res.body!.getReader();
    await readChunk(reader); // "ready"

    // No time advanced at all — only the real event-bus wake should trigger this.
    notifyPossibleNewMail("user@example.com");
    // Flush the microtask queue the wake handler's async check runs on.
    await vi.advanceTimersByTimeAsync(0);

    const newMailChunk = await readUntilEvent(reader, "new_mail");
    expect(newMailChunk).toContain('"count":1');

    controller.abort();
  });

  it("does not react to a wake signal for a different user", async () => {
    vi.useFakeTimers();
    gmailServiceInstance.getCurrentHistoryId.mockResolvedValue("100");
    gmailServiceInstance.listNewMessageIdsSince.mockResolvedValue({ newMessageIds: ["a"], newHistoryId: "101" });

    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/sync/stream", { signal: controller.signal }));
    const reader = res.body!.getReader();
    await readChunk(reader); // "ready"

    notifyPossibleNewMail("someone-else@example.com");
    await vi.advanceTimersByTimeAsync(0);

    expect(gmailServiceInstance.listNewMessageIdsSince).not.toHaveBeenCalled();
    controller.abort();
  });
});

describe("GET /api/sync/stream — history synchronization failure handling", () => {
  it("resyncs from the current historyId when the stored one has expired (404/NOT_FOUND), without emitting a sync_error", async () => {
    vi.useFakeTimers();
    gmailServiceInstance.getCurrentHistoryId.mockResolvedValueOnce("100").mockResolvedValueOnce("200-resynced");
    gmailServiceInstance.listNewMessageIdsSince.mockRejectedValue(new MailServiceError("expired", "NOT_FOUND"));

    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/sync/stream", { signal: controller.signal }));
    const reader = res.body!.getReader();
    await readChunk(reader); // "ready"

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(gmailServiceInstance.getCurrentHistoryId).toHaveBeenCalledTimes(2);
    controller.abort();
  });

  it("sends a sync_error event when the poll fails for a non-expiry reason", async () => {
    vi.useFakeTimers();
    gmailServiceInstance.getCurrentHistoryId.mockResolvedValue("100");
    gmailServiceInstance.listNewMessageIdsSince.mockRejectedValue(new Error("Gmail API is down"));

    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/sync/stream", { signal: controller.signal }));
    const reader = res.body!.getReader();
    await readChunk(reader); // "ready"

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    const errorChunk = await readUntilEvent(reader, "sync_error");
    expect(errorChunk).toContain("Temporarily unable to check for new mail");
    controller.abort();
  });
});

describe("GET /api/sync/stream — startup failure", () => {
  it("returns 502 if the initial historyId can't be established", async () => {
    gmailServiceInstance.getCurrentHistoryId.mockRejectedValue(new Error("network down"));

    const res = await GET(new Request("http://localhost/api/sync/stream"));

    expect(res.status).toBe(502);
  });
});
