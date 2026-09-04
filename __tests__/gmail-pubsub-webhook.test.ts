import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const notifyPossibleNewMail = vi.fn();
vi.mock("@/lib/sync/event-bus", () => ({ notifyPossibleNewMail }));

// Imported after the mock so the route picks up the mocked event bus.
const { POST } = await import("@/app/api/webhooks/gmail-pubsub/route");

function pubsubRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pushPayload(emailAddress: string, historyId = "123") {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString("base64");
  return { message: { data, messageId: "m1", publishTime: new Date().toISOString() }, subscription: "sub1" };
}

describe("POST /api/webhooks/gmail-pubsub — verification behavior", () => {
  beforeEach(() => {
    notifyPossibleNewMail.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects with 401 when a token is configured but the request supplies the wrong one", async () => {
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "correct-secret");
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub?token=wrong-secret", pushPayload("user@example.com"));

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(notifyPossibleNewMail).not.toHaveBeenCalled();
  });

  it("rejects with 401 when a token is configured but the request supplies none", async () => {
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "correct-secret");
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub", pushPayload("user@example.com"));

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(notifyPossibleNewMail).not.toHaveBeenCalled();
  });

  it("accepts and processes the request when the correct token is supplied", async () => {
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "correct-secret");
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub?token=correct-secret", pushPayload("user@example.com"));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(notifyPossibleNewMail).toHaveBeenCalledWith("user@example.com");
  });

  it("REJECTS the request when no token is configured AND running in production — never silently unauthenticated in prod", async () => {
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "");
    vi.stubEnv("NODE_ENV", "production");
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub", pushPayload("user@example.com"));

    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(notifyPossibleNewMail).not.toHaveBeenCalled();
  });

  it("allows the request when no token is configured outside production (dev convenience)", async () => {
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub", pushPayload("user@example.com"));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(notifyPossibleNewMail).toHaveBeenCalledWith("user@example.com");
  });
});

describe("POST /api/webhooks/gmail-pubsub — event parsing", () => {
  beforeEach(() => {
    notifyPossibleNewMail.mockClear();
    vi.stubEnv("GMAIL_PUBSUB_VERIFICATION_TOKEN", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("acks (200) without notifying when the message has no data payload", async () => {
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub", { message: {}, subscription: "sub1" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(notifyPossibleNewMail).not.toHaveBeenCalled();
  });

  it("acks (200) without throwing when the base64 payload isn't valid JSON", async () => {
    const req = pubsubRequest("http://localhost/api/webhooks/gmail-pubsub", {
      message: { data: Buffer.from("not json").toString("base64") },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(notifyPossibleNewMail).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed (non-JSON) request body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/gmail-pubsub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
