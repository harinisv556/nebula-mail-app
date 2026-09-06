import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/lib/store/app-store";
import { dispatchAction } from "@/lib/ai/dispatch-actions";
import type { AppAction } from "@/lib/types/actions";

/**
 * Regression coverage for a real bug found via live browser testing: asking
 * the assistant to filter/search without mentioning a folder (e.g. "Show
 * only unread emails from this week") produced a FILTER_EMAILS action whose
 * payload omits `folder`. The old dispatch code always included `folder:
 * action.payload.folder` in the object passed to applyEmailFilters — even
 * when that value was `undefined` — and the store's `{ ...current,
 * ...partial }` merge treats an explicit `undefined` key as "clear this
 * field", not "leave it alone". That silently corrupted the current folder
 * to `undefined`, which URLSearchParams then serialized as the literal
 * string "folder=undefined", and the server correctly rejected the request.
 */
const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

describe("dispatchAction — FILTER_EMAILS folder preservation (regression)", () => {
  it("preserves the currently selected folder when the action omits it, and never sends folder=undefined", async () => {
    const fetchMock = mockFetchOnce({ emails: [] });
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ filters: { folder: "sent" }, currentFolder: "sent" });

    const action: AppAction = { type: "FILTER_EMAILS", payload: { unread: true, dateRange: "this_week" } };
    await dispatchAction(action);

    expect(useAppStore.getState().filters.folder).toBe("sent");
    expect(useAppStore.getState().currentFolder).toBe("sent");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("folder=undefined");
    expect(url).toContain("folder=sent");
  });

  it("still switches folders when the action explicitly specifies one", async () => {
    const fetchMock = mockFetchOnce({ emails: [] });
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ filters: { folder: "inbox" }, currentFolder: "inbox" });

    const action: AppAction = { type: "FILTER_EMAILS", payload: { folder: "sent" } };
    await dispatchAction(action);

    expect(useAppStore.getState().filters.folder).toBe("sent");
    expect(useAppStore.getState().currentFolder).toBe("sent");
  });

  it("preserves all other existing filter values when the action only changes one field", async () => {
    const fetchMock = mockFetchOnce({ emails: [] });
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ filters: { folder: "inbox", sender: "sarah@example.com", unreadOnly: true } });

    const action: AppAction = { type: "FILTER_EMAILS", payload: { dateRange: "last_7_days" } };
    await dispatchAction(action);

    expect(useAppStore.getState().filters).toMatchObject({
      folder: "inbox",
      sender: "sarah@example.com",
      unreadOnly: true,
      dateRange: "last_7_days",
    });
  });

  it("does not default to inbox when the user is currently viewing a non-default folder", async () => {
    const fetchMock = mockFetchOnce({ emails: [] });
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ filters: { folder: "sent" }, currentFolder: "sent" });

    const action: AppAction = { type: "FILTER_EMAILS", payload: { keyword: "invoice" } };
    await dispatchAction(action);

    // The bug's fallback path defaults to "inbox" only as an absolute last
    // resort inside filtersToQuery — the primary fix (omitting unset keys)
    // should mean folder is never lost in the first place, so it must still
    // read "sent" here, not silently fall back to "inbox".
    expect(useAppStore.getState().filters.folder).toBe("sent");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("folder=sent");
  });
});
