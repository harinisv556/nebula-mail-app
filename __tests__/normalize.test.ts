import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "googleapis";
import { folderFromLabels, normalizeMessage, parseAddressList } from "@/lib/mail/normalize";

describe("parseAddressList", () => {
  it("parses a single named address", () => {
    expect(parseAddressList('"Sarah Chen" <sarah@example.com>')).toEqual([{ name: "Sarah Chen", email: "sarah@example.com" }]);
  });

  it("parses multiple comma-separated addresses, ignoring commas inside angle brackets", () => {
    expect(parseAddressList('Sarah <sarah@example.com>, david@example.com')).toEqual([
      { name: "Sarah", email: "sarah@example.com" },
      { email: "david@example.com" },
    ]);
  });

  it("returns an empty array for undefined input", () => {
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe("folderFromLabels", () => {
  it("defaults to inbox", () => {
    expect(folderFromLabels(undefined)).toBe("inbox");
  });
  it("recognizes sent", () => {
    expect(folderFromLabels(["SENT"])).toBe("sent");
  });
  it("recognizes trash", () => {
    expect(folderFromLabels(["TRASH", "UNREAD"])).toBe("trash");
  });
});

function buildMessage(overrides: Partial<gmail_v1.Schema$Message> = {}): gmail_v1.Schema$Message {
  return {
    id: "msg1",
    threadId: "thread1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Hello preview",
    internalDate: String(Date.parse("2026-01-15T10:00:00Z")),
    payload: {
      headers: [
        { name: "From", value: '"Sarah Chen" <sarah@example.com>' },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Project update" },
        { name: "Date", value: "Thu, 15 Jan 2026 10:00:00 +0000" },
        { name: "Message-Id", value: "<abc123@mail.gmail.com>" },
      ],
      mimeType: "text/plain",
      body: { data: Buffer.from("Hello, this is the body.").toString("base64").replace(/\+/g, "-").replace(/\//g, "_") },
    },
    ...overrides,
  };
}

describe("normalizeMessage", () => {
  it("normalizes a plain-text Gmail message into the app Email model", () => {
    const email = normalizeMessage(buildMessage());
    expect(email).toMatchObject({
      id: "msg1",
      threadId: "thread1",
      folder: "inbox",
      subject: "Project update",
      from: { name: "Sarah Chen", email: "sarah@example.com" },
      isRead: false,
      bodyText: "Hello, this is the body.",
      messageIdHeader: "<abc123@mail.gmail.com>",
    });
  });

  it("throws a MailServiceError for a message missing id/threadId", () => {
    expect(() => normalizeMessage({})).toThrow();
  });
});
