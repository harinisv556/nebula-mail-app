import { describe, expect, it, vi } from "vitest";
import { notifyPossibleNewMail, onWake } from "@/lib/sync/event-bus";

describe("event-bus — Pub/Sub webhook to SSE stream bridge", () => {
  it("delivers a wake notification to a listener registered for that user", () => {
    const callback = vi.fn();
    const unsubscribe = onWake("alice@example.com", callback);

    notifyPossibleNewMail("alice@example.com");

    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not deliver a wake notification to a listener registered for a different user", () => {
    const callback = vi.fn();
    const unsubscribe = onWake("alice@example.com", callback);

    notifyPossibleNewMail("bob@example.com");

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("supports multiple independent listeners for the same user (e.g. multiple open tabs)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = onWake("carol@example.com", first);
    const unsubscribeSecond = onWake("carol@example.com", second);

    notifyPossibleNewMail("carol@example.com");

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("stops delivering notifications after unsubscribe", () => {
    const callback = vi.fn();
    const unsubscribe = onWake("dave@example.com", callback);
    unsubscribe();

    notifyPossibleNewMail("dave@example.com");

    expect(callback).not.toHaveBeenCalled();
  });

  it("emitting for a user with no listeners is a harmless no-op", () => {
    expect(() => notifyPossibleNewMail("nobody-is-listening@example.com")).not.toThrow();
  });
});
