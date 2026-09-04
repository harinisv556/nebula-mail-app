import { describe, expect, it } from "vitest";
import { validateAction } from "@/lib/ai/validate-action";
import { hashEmailPayload } from "@/lib/mail/canonical-payload";
import type { UIContext } from "@/lib/types/context";

const baseContext: UIContext = {
  currentView: "inbox",
  currentFolder: "inbox",
  currentFilters: { folder: "inbox" },
  visibleEmailIds: [],
  pendingSendConfirmation: null,
};

async function contextWithPendingConfirmation(payload: { to: string[]; subject: string; body: string }, expiresInMs = 60_000): Promise<UIContext> {
  return {
    ...baseContext,
    pendingSendConfirmation: { payloadHash: await hashEmailPayload(payload), expiresAt: Date.now() + expiresInMs },
  };
}

describe("validateAction — structural validation", () => {
  it("accepts a well-formed FILL_COMPOSE action", async () => {
    const result = await validateAction("FILL_COMPOSE", { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" }, baseContext);
    expect(result.ok).toBe(true);
  });

  it("rejects FILL_COMPOSE with an invalid email address", async () => {
    const result = await validateAction("FILL_COMPOSE", { to: ["not-an-email"], subject: "Hi", body: "Hi" }, baseContext);
    expect(result.ok).toBe(false);
  });

  it("rejects FILL_COMPOSE missing a required field", async () => {
    const result = await validateAction("FILL_COMPOSE", { to: ["john@example.com"], body: "Hi" }, baseContext);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown action type", async () => {
    const result = await validateAction("DELETE_EVERYTHING", {}, baseContext);
    expect(result.ok).toBe(false);
  });

  it("accepts NAVIGATE with a valid view", async () => {
    expect((await validateAction("NAVIGATE", { view: "sent" }, baseContext)).ok).toBe(true);
  });

  it("rejects NAVIGATE with an invalid view", async () => {
    expect((await validateAction("NAVIGATE", { view: "settings" }, baseContext)).ok).toBe(false);
  });

  it("accepts REQUEST_SEND_CONFIRMATION regardless of pending state", async () => {
    const payload = { to: ["john@example.com"], subject: "Hi", body: "Hi there" };
    const result = await validateAction("REQUEST_SEND_CONFIRMATION", payload, baseContext);
    expect(result.ok).toBe(true);
  });
});

describe("validateAction — send confirmation gating (content-bound, not just a boolean)", () => {
  const approvedPayload = { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" };

  it("rejects SEND_EMAIL when no confirmation is pending at all, and downgrades to a confirmation request", async () => {
    const result = await validateAction("SEND_EMAIL", approvedPayload, baseContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.downgradeTo?.type).toBe("REQUEST_SEND_CONFIRMATION");
      expect(result.downgradeTo?.payload).toEqual(approvedPayload);
    }
  });

  it("accepts SEND_EMAIL when its payload exactly matches the approved (hashed) payload", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload);
    const result = await validateAction("SEND_EMAIL", approvedPayload, context);
    expect(result.ok).toBe(true);
  });

  it("rejects SEND_EMAIL with a changed recipient, even though a confirmation is pending", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload);
    const tampered = { ...approvedPayload, to: ["someone-else@example.com"] };
    const result = await validateAction("SEND_EMAIL", tampered, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/does not match/i);
      expect(result.downgradeTo?.type).toBe("REQUEST_SEND_CONFIRMATION");
    }
  });

  it("rejects SEND_EMAIL with a changed subject", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload);
    const tampered = { ...approvedPayload, subject: "Something else entirely" };
    const result = await validateAction("SEND_EMAIL", tampered, context);
    expect(result.ok).toBe(false);
  });

  it("rejects SEND_EMAIL with a changed body", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload);
    const tampered = { ...approvedPayload, body: "Completely different content." };
    const result = await validateAction("SEND_EMAIL", tampered, context);
    expect(result.ok).toBe(false);
  });

  it("accepts SEND_EMAIL when only incidental formatting differs (address casing, surrounding body whitespace)", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload);
    // Note: the address itself must still be a structurally valid email (no
    // embedded whitespace) — that's enforced by AppActionSchema before the
    // hash comparison ever runs. This exercises the *content-equivalence*
    // normalization (case-folding addresses, trimming body whitespace), not
    // an escape hatch for malformed input.
    const reformatted = { to: ["JOHN@EXAMPLE.COM"], subject: approvedPayload.subject, body: `  ${approvedPayload.body}  ` };
    const result = await validateAction("SEND_EMAIL", reformatted, context);
    expect(result.ok).toBe(true);
  });

  it("rejects SEND_EMAIL when the pending confirmation has expired", async () => {
    const context = await contextWithPendingConfirmation(approvedPayload, -1000); // already expired
    const result = await validateAction("SEND_EMAIL", approvedPayload, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/expired/i);
      expect(result.downgradeTo?.type).toBe("REQUEST_SEND_CONFIRMATION");
    }
  });
});
