import { create } from "zustand";
import type { AppView, UIContext } from "@/lib/types/context";
import { DEFAULT_FILTERS, EMPTY_DRAFT, type ComposeDraft, type Email, type EmailFilters, type EmailSummary, type MailFolder } from "@/lib/types/mail";
import { buildForwardDraft, buildReplyDraft } from "@/lib/mail/compose-helpers";

/**
 * The shared application action layer (PDF Phase 5 / brief Phase 5).
 *
 * This is the ONLY place that mutates mail-related UI state. A click in the
 * inbox and an AI-dispatched action both end up calling the exact same
 * functions on this store — see src/lib/ai/dispatch-actions.ts for how the
 * assistant's validated actions are routed through here, and the `on*`
 * handlers in src/components/mail for how UI controls call the same
 * functions directly.
 */

export type SendStatus = "idle" | "sending" | "sent" | "error";

export interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: { type: string; summary: string }[];
  previews?: EmailPreview[];
  isError?: boolean;
}

interface AppState {
  // --- auth ---
  authEmail: string | null;
  authChecked: boolean;

  // --- navigation / view ---
  currentView: AppView;
  currentFolder: MailFolder;

  // --- inbox/sent list ---
  filters: EmailFilters;
  emails: EmailSummary[];
  emailsLoading: boolean;
  emailsError: string | null;

  // --- detail view ---
  openEmail: Email | null;
  openEmailLoading: boolean;
  openEmailError: string | null;

  // --- compose ---
  composeOpen: boolean;
  composeDraft: ComposeDraft;
  pendingConfirmation: ComposeDraft | null;
  sendStatus: SendStatus;
  sendError: string | null;

  // --- assistant ---
  assistantMessages: AssistantMessage[];
  assistantBusy: boolean;

  // --- misc ---
  darkMode: boolean;
  newMailBanner: number;

  // === application actions ===
  setAuth: (email: string | null) => void;
  navigateToInbox: () => Promise<void>;
  navigateToSent: () => Promise<void>;
  openCompose: () => void;
  closeCompose: () => void;
  fillCompose: (partial: Partial<ComposeDraft>) => void;
  searchEmails: (params: { keyword?: string; sender?: string; dateRange?: EmailFilters["dateRange"]; folder?: MailFolder }) => Promise<void>;
  applyEmailFilters: (partial: Partial<EmailFilters>) => Promise<void>;
  refreshCurrentList: () => Promise<void>;
  openEmailById: (id: string) => Promise<void>;
  closeEmail: () => void;
  prepareReply: (emailId: string, draftBody?: string) => Promise<void>;
  prepareForward: (emailId: string, to?: string[], draftBody?: string) => Promise<void>;
  requestSendConfirmation: (draft: ComposeDraft) => void;
  confirmSend: () => Promise<void>;
  cancelSendConfirmation: () => void;
  sendEmail: (draft: ComposeDraft) => Promise<void>;
  toggleDarkMode: () => void;
  pushAssistantMessage: (msg: AssistantMessage) => void;
  setAssistantBusy: (busy: boolean) => void;
  bumpNewMailBanner: () => void;
  getUIContext: () => UIContext;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

function filtersToQuery(filters: EmailFilters): string {
  const params = new URLSearchParams();
  params.set("folder", filters.folder);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.sender) params.set("sender", filters.sender);
  if (filters.unreadOnly) params.set("unreadOnly", "true");
  if (filters.dateRange) params.set("dateRange", filters.dateRange);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params.toString();
}

let messageIdCounter = 0;
export function nextMessageId(): string {
  messageIdCounter += 1;
  return `m_${Date.now()}_${messageIdCounter}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  authEmail: null,
  authChecked: false,

  currentView: "inbox",
  currentFolder: "inbox",

  filters: DEFAULT_FILTERS,
  emails: [],
  emailsLoading: false,
  emailsError: null,

  openEmail: null,
  openEmailLoading: false,
  openEmailError: null,

  composeOpen: false,
  composeDraft: EMPTY_DRAFT,
  pendingConfirmation: null,
  sendStatus: "idle",
  sendError: null,

  assistantMessages: [],
  assistantBusy: false,

  darkMode: false,
  newMailBanner: 0,

  setAuth: (email) => set({ authEmail: email, authChecked: true }),

  navigateToInbox: async () => {
    set({ currentView: "inbox", currentFolder: "inbox", filters: { ...get().filters, folder: "inbox" } });
    await get().refreshCurrentList();
  },

  navigateToSent: async () => {
    set({ currentView: "sent", currentFolder: "sent", filters: { ...get().filters, folder: "sent" } });
    await get().refreshCurrentList();
  },

  openCompose: () => set({ currentView: "compose", composeOpen: true, composeDraft: EMPTY_DRAFT, sendStatus: "idle", sendError: null }),

  closeCompose: () =>
    set((s) => ({
      composeOpen: false,
      composeDraft: EMPTY_DRAFT,
      pendingConfirmation: null,
      sendStatus: "idle",
      sendError: null,
      currentView: s.openEmail ? "email_detail" : s.currentFolder === "sent" ? "sent" : "inbox",
    })),

  fillCompose: (partial) =>
    set((s) => ({
      currentView: "compose",
      composeOpen: true,
      composeDraft: { ...s.composeDraft, ...partial },
    })),

  applyEmailFilters: async (partial) => {
    const merged: EmailFilters = { ...get().filters, ...partial };
    set({ filters: merged, currentFolder: merged.folder, currentView: merged.folder === "sent" ? "sent" : "inbox" });
    await get().refreshCurrentList();
  },

  searchEmails: async (params) => {
    const merged: EmailFilters = {
      ...get().filters,
      folder: params.folder ?? get().filters.folder,
      keyword: params.keyword,
      sender: params.sender,
      dateRange: params.dateRange,
      dateFrom: undefined,
      dateTo: undefined,
    };
    set({ filters: merged, currentFolder: merged.folder, currentView: merged.folder === "sent" ? "sent" : "inbox" });
    await get().refreshCurrentList();
  },

  refreshCurrentList: async () => {
    set({ emailsLoading: true, emailsError: null });
    try {
      const query = filtersToQuery(get().filters);
      const data = await fetchJson<{ emails: EmailSummary[] }>(`/api/mail/list?${query}`);
      set({ emails: data.emails, emailsLoading: false });
    } catch (err) {
      set({ emailsLoading: false, emailsError: err instanceof Error ? err.message : "Failed to load emails." });
    }
  },

  openEmailById: async (id) => {
    set({ currentView: "email_detail", openEmailLoading: true, openEmailError: null });
    try {
      const data = await fetchJson<{ email: Email }>(`/api/mail/${id}`);
      set((s) => ({
        openEmail: data.email,
        openEmailLoading: false,
        emails: s.emails.map((e) => (e.id === id ? { ...e, isRead: true } : e)),
      }));
    } catch (err) {
      set({ openEmailLoading: false, openEmailError: err instanceof Error ? err.message : "Failed to load email." });
    }
  },

  closeEmail: () => set((s) => ({ openEmail: null, currentView: s.currentFolder === "sent" ? "sent" : "inbox" })),

  prepareReply: async (emailId, draftBody) => {
    let email = get().openEmail;
    if (!email || email.id !== emailId) {
      await get().openEmailById(emailId);
      email = get().openEmail;
    }
    if (!email) return;
    const draft = buildReplyDraft(email, draftBody);
    set({ currentView: "compose", composeOpen: true, composeDraft: draft, sendStatus: "idle", sendError: null });
  },

  prepareForward: async (emailId, to, draftBody) => {
    let email = get().openEmail;
    if (!email || email.id !== emailId) {
      await get().openEmailById(emailId);
      email = get().openEmail;
    }
    if (!email) return;
    const draft = buildForwardDraft(email, to, draftBody);
    set({ currentView: "compose", composeOpen: true, composeDraft: draft, sendStatus: "idle", sendError: null });
  },

  requestSendConfirmation: (draft) =>
    set({ currentView: "compose", composeOpen: true, composeDraft: draft, pendingConfirmation: draft, sendStatus: "idle", sendError: null }),

  cancelSendConfirmation: () => set({ pendingConfirmation: null }),

  confirmSend: async () => {
    const draft = get().pendingConfirmation;
    if (!draft) return;
    set({ pendingConfirmation: null });
    await get().sendEmail(draft);
  },

  sendEmail: async (draft) => {
    set({ sendStatus: "sending", sendError: null });
    try {
      await fetchJson(`/api/mail/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      set({ sendStatus: "sent", composeOpen: false, composeDraft: EMPTY_DRAFT, pendingConfirmation: null });
      if (get().currentFolder === "sent") await get().refreshCurrentList();
    } catch (err) {
      set({ sendStatus: "error", sendError: err instanceof Error ? err.message : "Failed to send email." });
    }
  },

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  pushAssistantMessage: (msg) => set((s) => ({ assistantMessages: [...s.assistantMessages, msg] })),
  setAssistantBusy: (busy) => set({ assistantBusy: busy }),
  bumpNewMailBanner: () => set((s) => ({ newMailBanner: s.newMailBanner + 1 })),

  getUIContext: (): UIContext => {
    const s = get();
    return {
      currentView: s.currentView,
      currentFolder: s.currentFolder,
      currentFilters: s.filters,
      openEmail: s.openEmail
        ? {
            id: s.openEmail.id,
            threadId: s.openEmail.threadId,
            subject: s.openEmail.subject,
            from: s.openEmail.from,
            to: s.openEmail.to,
            snippet: s.openEmail.preview,
          }
        : undefined,
      composeDraft: s.composeOpen
        ? { to: s.composeDraft.to, subject: s.composeDraft.subject, hasBody: s.composeDraft.body.trim().length > 0 }
        : undefined,
      visibleEmailIds: s.emails.map((e) => e.id),
      sendConfirmationPending: s.pendingConfirmation !== null,
    };
  },
}));
