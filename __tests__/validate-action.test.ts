import { describe, expect, it } from "vitest";
import { validateAction } from "@/lib/ai/validate-action";
import type { UIContext } from "@/lib/types/context";

const baseContext: UIContext = {
  currentView: "inbox",
  currentFolder: "inbox",
  currentFilters: { folder: "inbox" },
  visibleEmailIds: [],
  sendConfirmationPending: false,
};

describe("validateAction", () => {
  it("accepts a well-formed FILL_COMPOSE action", () => {
    const result = validateAction("FILL_COMPOSE", { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" }, baseContext);
    expect(result.ok).toBe(true);
  });

  it("rejects FILL_COMPOSE with an invalid email address", () => {
    const result = validateAction("FILL_COMPOSE", { to: ["not-an-email"], subject: "Hi", body: "Hi" }, baseContext);
    expect(result.ok).toBe(false);
  });

  it("rejects FILL_COMPOSE missing a required field", () => {
    const result = validateAction("FILL_COMPOSE", { to: ["john@example.com"], body: "Hi" }, baseContext);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown action type", () => {
    const result = validateAction("DELETE_EVERYTHING", {}, baseContext);
    expect(result.ok).toBe(false);
  });

  it("rejects SEND_EMAIL when no confirmation is pending, and downgrades to a confirmation request", () => {
    const payload = { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" };
    const result = validateAction("SEND_EMAIL", payload, baseContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.downgradeTo?.type).toBe("REQUEST_SEND_CONFIRMATION");
      expect(result.downgradeTo?.payload).toEqual(payload);
    }
  });

  it("accepts SEND_EMAIL when a confirmation is pending", () => {
    const payload = { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" };
    const result = validateAction("SEND_EMAIL", payload, { ...baseContext, sendConfirmationPending: true });
    expect(result.ok).toBe(true);
  });

  it("accepts REQUEST_SEND_CONFIRMATION regardless of pending state", () => {
    const payload = { to: ["john@example.com"], subject: "Hi", body: "Hi there" };
    const result = validateAction("REQUEST_SEND_CONFIRMATION", payload, baseContext);
    expect(result.ok).toBe(true);
  });

  it("accepts NAVIGATE with a valid view", () => {
    expect(validateAction("NAVIGATE", { view: "sent" }, baseContext).ok).toBe(true);
  });

  it("rejects NAVIGATE with an invalid view", () => {
    expect(validateAction("NAVIGATE", { view: "settings" }, baseContext).ok).toBe(false);
  });
});
