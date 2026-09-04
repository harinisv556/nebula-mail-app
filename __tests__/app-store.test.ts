import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/lib/store/app-store";
import type { Email, EmailSummary } from "@/lib/types/mail";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

const summary: EmailSummary = {
  id: "e1",
  threadId: "t1",
  folder: "inbox",
  from: { email: "sarah@example.com" },
  to: [],
  subject: "Hi",
  preview: "Hello",
  date: new Date().toISOString(),
  isRead: false,
  isStarred: false,
  hasAttachments: false,
};

describe("app-store — navigation (application action layer)", () => {
  it("navigateToInbox sets the view/folder and loads emails from the same endpoint the UI list uses", async () => {
    const fetchMock = mockFetchOnce({ emails: [summary] });
    vi.stubGlobal("fetch", fetchMock);

    await useAppStore.getState().navigateToInbox();

    expect(useAppStore.getState().currentView).toBe("inbox");
    expect(useAppStore.getState().currentFolder).toBe("inbox");
    expect(useAppStore.getState().emails).toEqual([summary]);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/mail/list?");
  });

  it("navigateToSent switches folder to sent", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ emails: [] }));
    await useAppStore.getState().navigateToSent();
    expect(useAppStore.getState().currentFolder).toBe("sent");
    expect(useAppStore.getState().currentView).toBe("sent");
  });

  it("surfaces a friendly error when the list request fails", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ message: "Gmail returned an unexpected error." }, false));
    await useAppStore.getState().navigateToInbox();
    expect(useAppStore.getState().emailsError).toBe("Gmail returned an unexpected error.");
    expect(useAppStore.getState().emailsLoading).toBe(false);
  });
});

describe("app-store — compose (application action layer)", () => {
  it("openCompose opens a blank compose view", () => {
    useAppStore.getState().openCompose();
    const s = useAppStore.getState();
    expect(s.composeOpen).toBe(true);
    expect(s.currentView).toBe("compose");
    expect(s.composeDraft).toEqual({ to: [], subject: "", body: "" });
  });

  it("fillCompose merges fields without clobbering ones not provided", () => {
    useAppStore.getState().openCompose();
    useAppStore.getState().fillCompose({ to: ["john@example.com"], subject: "Meeting Tomorrow" });
    useAppStore.getState().fillCompose({ body: "Let's meet at 3pm" });
    expect(useAppStore.getState().composeDraft).toMatchObject({
      to: ["john@example.com"],
      subject: "Meeting Tomorrow",
      body: "Let's meet at 3pm",
    });
  });
});

describe("app-store — filters (shared between UI controls and the assistant)", () => {
  it("applyEmailFilters merges into existing filters and re-fetches", async () => {
    const fetchMock = mockFetchOnce({ emails: [] });
    vi.stubGlobal("fetch", fetchMock);

    await useAppStore.getState().applyEmailFilters({ unreadOnly: true, dateRange: "this_week" });

    expect(useAppStore.getState().filters).toMatchObject({ folder: "inbox", unreadOnly: true, dateRange: "this_week" });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("unreadOnly=true");
    expect(url).toContain("dateRange=this_week");
  });

  it("searchEmails resets keyword/sender/dateRange rather than merging", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ emails: [] }));
    await useAppStore.getState().applyEmailFilters({ sender: "sarah@example.com" });
    await useAppStore.getState().searchEmails({ keyword: "invoice" });
    expect(useAppStore.getState().filters.sender).toBeUndefined();
    expect(useAppStore.getState().filters.keyword).toBe("invoice");
  });
});

describe("app-store — open email / reply (application action layer)", () => {
  const fullEmail: Email = {
    id: "e1",
    threadId: "t1",
    folder: "inbox",
    from: { email: "david@example.com", name: "David" },
    to: [{ email: "me@example.com" }],
    subject: "Status",
    preview: "...",
    bodyText: "Here is the status.",
    date: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    attachments: [],
    labels: [],
  };

  it("openEmailById fetches and marks the list item read", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ email: fullEmail }));
    useAppStore.setState({ emails: [{ ...summary, id: "e1", isRead: false }] });

    await useAppStore.getState().openEmailById("e1");

    expect(useAppStore.getState().openEmail?.id).toBe("e1");
    expect(useAppStore.getState().currentView).toBe("email_detail");
    expect(useAppStore.getState().emails[0].isRead).toBe(true);
  });

  it("prepareReply reuses the already-open email without re-fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ openEmail: fullEmail });

    await useAppStore.getState().prepareReply("e1", "Thanks!");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().composeOpen).toBe(true);
    expect(useAppStore.getState().composeDraft.to).toEqual(["david@example.com"]);
    expect(useAppStore.getState().composeDraft.subject).toBe("Re: Status");
  });

  it("prepareForward reuses the already-open email, fills the given recipient, and prefixes the subject with Fwd:", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAppStore.setState({ openEmail: fullEmail });

    await useAppStore.getState().prepareForward("e1", ["colleague@example.com"], "FYI");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().composeOpen).toBe(true);
    expect(useAppStore.getState().composeDraft.to).toEqual(["colleague@example.com"]);
    expect(useAppStore.getState().composeDraft.subject).toBe("Fwd: Status");
    expect(useAppStore.getState().composeDraft.body).toContain("FYI");
    expect(useAppStore.getState().composeDraft.body).toContain("Forwarded message");
  });

  it("prepareForward fetches the email first when it isn't the one currently open", async () => {
    const otherEmail = { ...fullEmail, id: "e2", subject: "Other subject" };
    vi.stubGlobal("fetch", mockFetchOnce({ email: otherEmail }));
    useAppStore.setState({ openEmail: null });

    await useAppStore.getState().prepareForward("e2");

    expect(useAppStore.getState().composeDraft.subject).toBe("Fwd: Other subject");
  });
});

describe("app-store — send confirmation gating", () => {
  it("requestSendConfirmation does not send the email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const draft = { to: ["john@example.com"], subject: "Hi", body: "Hello" };

    await useAppStore.getState().requestSendConfirmation(draft);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().pendingConfirmation).toEqual(draft);
    expect(useAppStore.getState().composeOpen).toBe(true);
  });

  it("requestSendConfirmation binds a payload hash and an expiry to the pending confirmation", async () => {
    const draft = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    await useAppStore.getState().requestSendConfirmation(draft);

    const s = useAppStore.getState();
    expect(s.pendingConfirmationHash).toBeTruthy();
    expect(s.pendingConfirmationExpiresAt).toBeGreaterThan(Date.now());
    expect(s.getUIContext().pendingSendConfirmation).toEqual({ payloadHash: s.pendingConfirmationHash, expiresAt: s.pendingConfirmationExpiresAt });
  });

  it("cancelSendConfirmation clears the pending draft without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await useAppStore.getState().requestSendConfirmation({ to: ["a@example.com"], subject: "s", body: "b" });

    useAppStore.getState().cancelSendConfirmation();

    expect(useAppStore.getState().pendingConfirmation).toBeNull();
    expect(useAppStore.getState().pendingConfirmationHash).toBeNull();
    expect(useAppStore.getState().pendingConfirmationExpiresAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirmSend actually sends via /api/mail/send and clears pending state", async () => {
    const fetchMock = mockFetchOnce({ ok: true, id: "sent1", threadId: "t1" });
    vi.stubGlobal("fetch", fetchMock);
    const draft = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    await useAppStore.getState().requestSendConfirmation(draft);

    await useAppStore.getState().confirmSend();

    expect(fetchMock).toHaveBeenCalledWith("/api/mail/send", expect.objectContaining({ method: "POST" }));
    expect(useAppStore.getState().pendingConfirmation).toBeNull();
    expect(useAppStore.getState().pendingConfirmationHash).toBeNull();
    expect(useAppStore.getState().pendingConfirmationExpiresAt).toBeNull();
    expect(useAppStore.getState().sendStatus).toBe("sent");
  });

  it("confirmSend refuses to send an expired confirmation and surfaces an error instead", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const draft = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    await useAppStore.getState().requestSendConfirmation(draft);
    // Simulate time having passed past the TTL without relying on fake timers.
    useAppStore.setState({ pendingConfirmationExpiresAt: Date.now() - 1000 });

    await useAppStore.getState().confirmSend();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().pendingConfirmation).toBeNull();
    expect(useAppStore.getState().sendStatus).toBe("error");
    expect(useAppStore.getState().sendError).toMatch(/expired/i);
  });
});
