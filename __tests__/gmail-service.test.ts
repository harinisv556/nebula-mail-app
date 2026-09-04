import { beforeEach, describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "googleapis";

// GmailMailService only needs authorizedClient() to produce something with
// an `.on()` method (used to listen for token refresh) — mock it out so
// these tests don't need real Google OAuth env vars or a real OAuth2Client.
vi.mock("@/lib/auth/google", () => ({
  authorizedClient: vi.fn(() => ({ on: vi.fn() })),
}));

const gmailMock = vi.hoisted(() => ({
  users: {
    messages: {
      list: vi.fn(),
      get: vi.fn(),
      send: vi.fn(),
      modify: vi.fn(),
    },
    getProfile: vi.fn(),
    history: { list: vi.fn() },
    watch: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock("googleapis", () => ({
  google: { gmail: vi.fn(() => gmailMock) },
}));

const { GmailMailService, buildRawMessage } = await import("@/lib/mail/gmail-service");

function decodeRaw(raw: string): string {
  return Buffer.from(raw, "base64").toString("utf-8");
}

function fakeTokens() {
  return { accessToken: "fake-access-token", refreshToken: "fake-refresh-token", expiryDate: Date.now() + 3600_000 };
}

function fakeGmailMessage(overrides: Partial<gmail_v1.Schema$Message> = {}): gmail_v1.Schema$Message {
  return {
    id: overrides.id ?? "m1",
    threadId: overrides.threadId ?? "t1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Preview text",
    internalDate: String(Date.parse("2026-01-15T10:00:00Z")),
    payload: {
      headers: [
        { name: "From", value: "sarah@example.com" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Hello" },
        { name: "Date", value: "Thu, 15 Jan 2026 10:00:00 +0000" },
      ],
      mimeType: "text/plain",
      body: { data: Buffer.from("Body text").toString("base64").replace(/\+/g, "-").replace(/\//g, "_") },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildRawMessage", () => {
  it("produces a base64url string (no +, /, or padding =) — not plain base64", () => {
    const raw = buildRawMessage({ to: ["john@example.com"], subject: "Hi", body: "Hello" });
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("includes To, Subject, and the body", () => {
    const raw = buildRawMessage({ to: ["john@example.com", "jane@example.com"], subject: "Team sync", body: "See you at 3pm." });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain("To: john@example.com, jane@example.com");
    expect(decoded).toContain("Subject: Team sync");
    expect(decoded).toContain("See you at 3pm.");
  });

  it("includes Cc and Bcc headers only when provided", () => {
    const withBoth = decodeRaw(buildRawMessage({ to: ["a@example.com"], cc: ["b@example.com"], bcc: ["c@example.com"], subject: "S", body: "B" }));
    expect(withBoth).toContain("Cc: b@example.com");
    expect(withBoth).toContain("Bcc: c@example.com");

    const withNeither = decodeRaw(buildRawMessage({ to: ["a@example.com"], subject: "S", body: "B" }));
    expect(withNeither).not.toContain("Cc:");
    expect(withNeither).not.toContain("Bcc:");
  });

  it("RFC 2047-encodes a non-ASCII subject", () => {
    const raw = buildRawMessage({ to: ["a@example.com"], subject: "Café ☕ meeting", body: "B" });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(decoded).not.toContain("Café ☕ meeting"); // must not appear raw/unencoded
  });

  it("leaves a plain-ASCII subject unencoded", () => {
    const decoded = decodeRaw(buildRawMessage({ to: ["a@example.com"], subject: "Plain subject", body: "B" }));
    expect(decoded).toContain("Subject: Plain subject");
  });

  it("adds In-Reply-To and References headers for a reply, and omits them otherwise", () => {
    const reply = decodeRaw(buildRawMessage({ to: ["a@example.com"], subject: "Re: S", body: "B", inReplyTo: "<abc@mail.gmail.com>" }));
    expect(reply).toContain("In-Reply-To: <abc@mail.gmail.com>");
    expect(reply).toContain("References: <abc@mail.gmail.com>");

    const fresh = decodeRaw(buildRawMessage({ to: ["a@example.com"], subject: "S", body: "B" }));
    expect(fresh).not.toContain("In-Reply-To");
    expect(fresh).not.toContain("References");
  });
});

describe("GmailMailService.listEmails", () => {
  it("lists message ids then fetches and normalizes each one", async () => {
    gmailMock.users.messages.list.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }] } });
    gmailMock.users.messages.get.mockImplementation(({ id }: { id: string }) => Promise.resolve({ data: fakeGmailMessage({ id }) }));

    const service = new GmailMailService(fakeTokens());
    const result = await service.listEmails({ folder: "inbox" }, 25);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "m1", subject: "Hello", from: { email: "sarah@example.com" } });
    expect(gmailMock.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ q: "in:inbox", maxResults: 25 }));
  });

  it("returns an empty array without calling get() when there are no messages", async () => {
    gmailMock.users.messages.list.mockResolvedValue({ data: {} });

    const service = new GmailMailService(fakeTokens());
    const result = await service.listEmails({ folder: "inbox" });

    expect(result).toEqual([]);
    expect(gmailMock.users.messages.get).not.toHaveBeenCalled();
  });

  it("skips a malformed individual message instead of failing the whole list", async () => {
    gmailMock.users.messages.list.mockResolvedValue({ data: { messages: [{ id: "good" }, { id: "bad" }] } });
    gmailMock.users.messages.get.mockImplementation(({ id }: { id: string }) =>
      id === "bad" ? Promise.resolve({ data: { id: undefined, threadId: undefined } }) : Promise.resolve({ data: fakeGmailMessage({ id }) }),
    );

    const service = new GmailMailService(fakeTokens());
    const result = await service.listEmails({ folder: "inbox" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good");
  });

  it("maps a 401 from the provider to MailServiceError(AUTH_EXPIRED)", async () => {
    gmailMock.users.messages.list.mockRejectedValue({ response: { status: 401 } });

    const service = new GmailMailService(fakeTokens());
    await expect(service.listEmails({ folder: "inbox" })).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });
});

describe("GmailMailService.getEmail", () => {
  it("fetches and fully normalizes a single message", async () => {
    gmailMock.users.messages.get.mockResolvedValue({ data: fakeGmailMessage() });

    const service = new GmailMailService(fakeTokens());
    const email = await service.getEmail("m1");

    expect(email).toMatchObject({ id: "m1", subject: "Hello", bodyText: "Body text" });
  });

  it("maps a 404 from the provider to MailServiceError(NOT_FOUND)", async () => {
    gmailMock.users.messages.get.mockRejectedValue({ response: { status: 404 } });

    const service = new GmailMailService(fakeTokens());
    await expect(service.getEmail("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GmailMailService.sendEmail", () => {
  it("sends a base64url-encoded MIME message and returns the id/threadId", async () => {
    gmailMock.users.messages.send.mockResolvedValue({ data: { id: "sent1", threadId: "t1" } });

    const service = new GmailMailService(fakeTokens());
    const result = await service.sendEmail({ to: ["john@example.com"], subject: "Hi", body: "Hello there" });

    expect(result).toEqual({ id: "sent1", threadId: "t1" });
    const rawArg = gmailMock.users.messages.send.mock.calls[0][0].requestBody.raw as string;
    expect(rawArg).not.toMatch(/[+/=]/); // proper base64url, not base64
    const decoded = Buffer.from(rawArg, "base64").toString("utf-8");
    expect(decoded).toContain("To: john@example.com");
    expect(decoded).toContain("Hello there");
  });

  it("throws MailServiceError when the provider omits id/threadId", async () => {
    gmailMock.users.messages.send.mockResolvedValue({ data: {} });

    const service = new GmailMailService(fakeTokens());
    await expect(service.sendEmail({ to: ["john@example.com"], subject: "Hi", body: "Hello" })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("maps a connection failure (no response) to MailServiceError(NETWORK_ERROR)", async () => {
    gmailMock.users.messages.send.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const service = new GmailMailService(fakeTokens());
    await expect(service.sendEmail({ to: ["john@example.com"], subject: "Hi", body: "Hello" })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("GmailMailService.markRead", () => {
  it("removes the UNREAD label when marking read", async () => {
    gmailMock.users.messages.modify.mockResolvedValue({ data: {} });
    const service = new GmailMailService(fakeTokens());

    await service.markRead("m1", true);

    expect(gmailMock.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", requestBody: { removeLabelIds: ["UNREAD"] } }));
  });

  it("adds the UNREAD label when marking unread", async () => {
    gmailMock.users.messages.modify.mockResolvedValue({ data: {} });
    const service = new GmailMailService(fakeTokens());

    await service.markRead("m1", false);

    expect(gmailMock.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", requestBody: { addLabelIds: ["UNREAD"] } }));
  });

  it("maps a 400 from the provider to MailServiceError(INVALID_INPUT)", async () => {
    gmailMock.users.messages.modify.mockRejectedValue({ response: { status: 400 } });
    const service = new GmailMailService(fakeTokens());

    await expect(service.markRead("m1", true)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("GmailMailService.getCurrentHistoryId", () => {
  it("returns the profile's historyId", async () => {
    gmailMock.users.getProfile.mockResolvedValue({ data: { historyId: "12345" } });
    const service = new GmailMailService(fakeTokens());

    await expect(service.getCurrentHistoryId()).resolves.toBe("12345");
  });

  it("throws MailServiceError when the provider omits historyId", async () => {
    gmailMock.users.getProfile.mockResolvedValue({ data: {} });
    const service = new GmailMailService(fakeTokens());

    await expect(service.getCurrentHistoryId()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("GmailMailService.listNewMessageIdsSince", () => {
  it("returns new inbox message ids and the advanced historyId", async () => {
    gmailMock.users.history.list.mockResolvedValue({
      data: {
        historyId: "200",
        history: [
          { messagesAdded: [{ message: { id: "new1", labelIds: ["INBOX"] } }] },
          { messagesAdded: [{ message: { id: "new2", labelIds: ["INBOX", "UNREAD"] } }] },
        ],
      },
    });
    const service = new GmailMailService(fakeTokens());

    const result = await service.listNewMessageIdsSince("100");

    expect(result.newHistoryId).toBe("200");
    expect(result.newMessageIds.sort()).toEqual(["new1", "new2"]);
  });

  it("excludes messages added to a mailbox other than the inbox (e.g. only SENT)", async () => {
    gmailMock.users.history.list.mockResolvedValue({
      data: { historyId: "200", history: [{ messagesAdded: [{ message: { id: "sent-only", labelIds: ["SENT"] } }] }] },
    });
    const service = new GmailMailService(fakeTokens());

    const result = await service.listNewMessageIdsSince("100");

    expect(result.newMessageIds).toEqual([]);
  });

  it("dedupes a message id that appears in multiple history records", async () => {
    gmailMock.users.history.list.mockResolvedValue({
      data: {
        historyId: "200",
        history: [
          { messagesAdded: [{ message: { id: "dup", labelIds: ["INBOX"] } }] },
          { messagesAdded: [{ message: { id: "dup", labelIds: ["INBOX"] } }] },
        ],
      },
    });
    const service = new GmailMailService(fakeTokens());

    const result = await service.listNewMessageIdsSince("100");

    expect(result.newMessageIds).toEqual(["dup"]);
  });

  it("maps a 404 (expired historyId) to MailServiceError(NOT_FOUND) so the caller can resync", async () => {
    gmailMock.users.history.list.mockRejectedValue({ response: { status: 404 } });
    const service = new GmailMailService(fakeTokens());

    await expect(service.listNewMessageIdsSince("expired")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GmailMailService.watchMailbox", () => {
  it("registers a watch and returns historyId/expiration", async () => {
    gmailMock.users.watch.mockResolvedValue({ data: { historyId: "1", expiration: "1999999999999" } });
    const service = new GmailMailService(fakeTokens());

    const result = await service.watchMailbox("projects/p/topics/t");

    expect(result).toEqual({ historyId: "1", expiration: "1999999999999" });
    expect(gmailMock.users.watch).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ topicName: "projects/p/topics/t" }) }),
    );
  });

  it("throws MailServiceError when the provider response is incomplete", async () => {
    gmailMock.users.watch.mockResolvedValue({ data: {} });
    const service = new GmailMailService(fakeTokens());

    await expect(service.watchMailbox("projects/p/topics/t")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("GmailMailService — token refresh capture", () => {
  it("captures a refreshed access token via getLatestTokens()", async () => {
    const authModule = await import("@/lib/auth/google");
    let capturedListener: ((tokens: unknown) => void) | undefined;
    vi.mocked(authModule.authorizedClient).mockReturnValueOnce({
      on: (_event: string, listener: (tokens: unknown) => void) => {
        capturedListener = listener;
      },
    } as never);

    const original = fakeTokens();
    const service = new GmailMailService(original);
    capturedListener?.({ access_token: "refreshed-token", expiry_date: original.expiryDate! + 1000 });

    expect(service.getLatestTokens().accessToken).toBe("refreshed-token");
    // Refresh token wasn't included in the event — the original should be preserved, not dropped.
    expect(service.getLatestTokens().refreshToken).toBe(original.refreshToken);
  });
});
