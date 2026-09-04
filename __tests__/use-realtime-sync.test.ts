import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachRealtimeSyncListeners } from "@/lib/sync/use-realtime-sync";
import { useAppStore } from "@/lib/store/app-store";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

type SyncEvent = { data: string };

/** Minimal fake EventSource — just enough of `addEventListener` to drive the listeners under test. */
class FakeEventSource {
  private handlers = new Map<string, ((event: SyncEvent) => void)[]>();

  addEventListener(type: string, handler: (event: SyncEvent) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  dispatch(type: string, event: SyncEvent = { data: "{}" }) {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

describe("attachRealtimeSyncListeners — new_mail propagation", () => {
  it("bumps the new-mail banner and refreshes the inbox list when the current folder is inbox", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ emails: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ currentFolder: "inbox" });
    const source = new FakeEventSource();

    attachRealtimeSyncListeners(source);
    source.dispatch("new_mail", { data: JSON.stringify({ count: 1 }) });

    expect(useAppStore.getState().newMailBanner).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/mail/list?");
  });

  it("bumps the banner but does NOT refetch when viewing a different folder", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ currentFolder: "sent" });
    const source = new FakeEventSource();

    attachRealtimeSyncListeners(source);
    source.dispatch("new_mail");

    expect(useAppStore.getState().newMailBanner).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears any existing sync error once mail arrives successfully", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ emails: [] }) }));
    useAppStore.setState({ currentFolder: "inbox", syncError: "Temporarily unable to check for new mail." });
    const source = new FakeEventSource();

    attachRealtimeSyncListeners(source);
    source.dispatch("new_mail");

    expect(useAppStore.getState().syncError).toBeNull();
  });
});

describe("attachRealtimeSyncListeners — sync_error handling", () => {
  it("surfaces the server's error message as a non-blocking sync error", () => {
    const source = new FakeEventSource();
    attachRealtimeSyncListeners(source);

    source.dispatch("sync_error", { data: JSON.stringify({ message: "Temporarily unable to check for new mail." }) });

    expect(useAppStore.getState().syncError).toBe("Temporarily unable to check for new mail.");
  });

  it("falls back to a generic message if the event payload isn't valid JSON", () => {
    const source = new FakeEventSource();
    attachRealtimeSyncListeners(source);

    source.dispatch("sync_error", { data: "not json" });

    expect(useAppStore.getState().syncError).toMatch(/temporarily unavailable/i);
  });
});

describe("attachRealtimeSyncListeners — ready handling", () => {
  it("clears a stale sync error once the stream reports ready (e.g. after reconnect)", () => {
    useAppStore.setState({ syncError: "some earlier error" });
    const source = new FakeEventSource();
    attachRealtimeSyncListeners(source);

    source.dispatch("ready");

    expect(useAppStore.getState().syncError).toBeNull();
  });
});
