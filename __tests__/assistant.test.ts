import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAssistant, type AnthropicMessagesClient } from "@/lib/ai/assistant";
import { OllamaMessagesClient } from "@/lib/ai/ollama-client";
import { hashEmailPayload } from "@/lib/mail/canonical-payload";
import type { UIContext } from "@/lib/types/context";
import type { MailService } from "@/lib/mail/mail-service";
import type { EmailSummary } from "@/lib/types/mail";

const baseContext: UIContext = {
  currentView: "inbox",
  currentFolder: "inbox",
  currentFilters: { folder: "inbox" },
  visibleEmailIds: [],
  pendingSendConfirmation: null,
};

function textMessage(text: string): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
  } as Anthropic.Message;
}

function toolUseMessage(name: string, input: unknown, id = "tool_1"): Anthropic.Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "tool_use", id, name, input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
  } as Anthropic.Message;
}

function fakeClient(responses: Anthropic.Message[]): AnthropicMessagesClient {
  let call = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const res = responses[Math.min(call, responses.length - 1)];
        call += 1;
        return res;
      }),
    },
  };
}

function fakeMailService(summaries: EmailSummary[] = []): MailService {
  return {
    listEmails: vi.fn(async () => summaries),
    getEmail: vi.fn(),
    sendEmail: vi.fn(),
    markRead: vi.fn(),
    getCurrentHistoryId: vi.fn(),
    listNewMessageIdsSince: vi.fn(),
  };
}

describe("runAssistant — compose intent", () => {
  it("translates a compose request into a FILL_COMPOSE action, not just a text reply", async () => {
    const client = fakeClient([
      toolUseMessage("FILL_COMPOSE", { to: ["john@example.com"], subject: "Meeting Tomorrow", body: "Let's meet at 3pm" }),
    ]);
    const result = await runAssistant("Send an email to john@example.com with subject 'Meeting Tomorrow' and body \"Let's meet at 3pm\"", baseContext, [], fakeMailService(), client);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ type: "FILL_COMPOSE", payload: { to: ["john@example.com"], subject: "Meeting Tomorrow" } });
  });
});

describe("runAssistant — search intent", () => {
  it("executes a real grounding search and returns actions + previews", async () => {
    const summaries: EmailSummary[] = [
      {
        id: "e1",
        threadId: "t1",
        folder: "inbox",
        from: { name: "Sarah", email: "sarah@example.com" },
        to: [],
        subject: "Project update",
        preview: "Here's the update...",
        date: new Date().toISOString(),
        isRead: false,
        isStarred: false,
        hasAttachments: false,
      },
    ];
    const client = fakeClient([
      toolUseMessage("SEARCH_EMAILS", { sender: "Sarah" }),
      textMessage("I found the project update email from Sarah."),
    ]);
    const mailService = fakeMailService(summaries);

    const result = await runAssistant("Find the email from Sarah about the project update", baseContext, [], mailService, client);

    expect(mailService.listEmails).toHaveBeenCalled();
    expect(result.actions.some((a) => a.type === "SEARCH_EMAILS")).toBe(true);
    expect(result.emailPreviews).toHaveLength(1);
    expect(result.emailPreviews[0].subject).toBe("Project update");
    expect(result.reply).toContain("Sarah");
  });
});

describe("runAssistant — navigation and open-email intent", () => {
  it("grounds via search then opens the resolved email by real id", async () => {
    const summaries: EmailSummary[] = [
      {
        id: "latest-david-id",
        threadId: "t2",
        folder: "inbox",
        from: { name: "David", email: "david@example.com" },
        to: [],
        subject: "Hello",
        preview: "Hi there",
        date: new Date().toISOString(),
        isRead: false,
        isStarred: false,
        hasAttachments: false,
      },
    ];
    const client = fakeClient([toolUseMessage("SEARCH_EMAILS", { sender: "David" }, "t1"), toolUseMessage("OPEN_EMAIL", { emailId: "latest-david-id" }, "t2")]);

    const result = await runAssistant("Open the latest email from David", baseContext, [], fakeMailService(summaries), client);

    expect(result.actions.map((a) => a.type)).toEqual(["SEARCH_EMAILS", "OPEN_EMAIL"]);
    const openAction = result.actions.find((a) => a.type === "OPEN_EMAIL");
    expect(openAction).toMatchObject({ payload: { emailId: "latest-david-id" } });
  });

  it("translates a plain navigation request", async () => {
    const client = fakeClient([toolUseMessage("NAVIGATE", { view: "sent" })]);
    const result = await runAssistant("Show me my sent folder", baseContext, [], fakeMailService(), client);
    expect(result.actions[0]).toMatchObject({ type: "NAVIGATE", payload: { view: "sent" } });
  });
});

describe("runAssistant — reply context awareness", () => {
  it("prepares a reply against the currently open email from context", async () => {
    const context: UIContext = {
      ...baseContext,
      currentView: "email_detail",
      openEmail: { id: "open-1", threadId: "t1", subject: "Q3 numbers", from: { email: "boss@example.com" }, to: [], snippet: "..." },
    };
    const client = fakeClient([toolUseMessage("PREPARE_REPLY", { emailId: "open-1" })]);
    const result = await runAssistant("Reply to this", context, [], fakeMailService(), client);
    expect(result.actions[0]).toMatchObject({ type: "PREPARE_REPLY", payload: { emailId: "open-1" } });
  });
});

describe("runAssistant — filtering intent", () => {
  it("translates 'unread this week' into a FILTER_EMAILS action", async () => {
    const client = fakeClient([toolUseMessage("FILTER_EMAILS", { unread: true, dateRange: "this_week" })]);
    const result = await runAssistant("Show only unread emails from this week", baseContext, [], fakeMailService(), client);
    expect(result.actions[0]).toMatchObject({ type: "FILTER_EMAILS", payload: { unread: true, dateRange: "this_week" } });
  });
});

describe("runAssistant — send confirmation gating", () => {
  it("never sends on the first ask — downgrades SEND_EMAIL to a confirmation request", async () => {
    const payload = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    const client = fakeClient([toolUseMessage("SEND_EMAIL", payload)]);
    const result = await runAssistant("Send an email to john saying hello", baseContext, [], fakeMailService(), client);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("REQUEST_SEND_CONFIRMATION");
    expect(result.rejections.length).toBeGreaterThan(0);
  });

  it("allows SEND_EMAIL once the context shows a confirmation is pending for that exact payload", async () => {
    const payload = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    const client = fakeClient([toolUseMessage("SEND_EMAIL", payload)]);
    const context: UIContext = {
      ...baseContext,
      pendingSendConfirmation: { payloadHash: await hashEmailPayload(payload), expiresAt: Date.now() + 60_000 },
    };
    const result = await runAssistant("Yes, send it", context, [], fakeMailService(), client);

    expect(result.actions[0].type).toBe("SEND_EMAIL");
    expect(result.rejections).toHaveLength(0);
  });

  it("still rejects SEND_EMAIL if a confirmation is pending but for a different payload", async () => {
    const approved = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    const attempted = { to: ["someone-else@example.com"], subject: "Hi", body: "Hello" };
    const client = fakeClient([toolUseMessage("SEND_EMAIL", attempted)]);
    const context: UIContext = {
      ...baseContext,
      pendingSendConfirmation: { payloadHash: await hashEmailPayload(approved), expiresAt: Date.now() + 60_000 },
    };
    const result = await runAssistant("Yes, send it", context, [], fakeMailService(), client);

    expect(result.actions[0].type).toBe("REQUEST_SEND_CONFIRMATION");
    expect(result.rejections.length).toBeGreaterThan(0);
  });
});

describe("runAssistant — invalid/unsupported commands", () => {
  it("falls back to plain text when the model calls no tool", async () => {
    const client = fakeClient([textMessage("I'm not sure what you'd like me to do — could you clarify?")]);
    const result = await runAssistant("asdkjfhaskjdfh", baseContext, [], fakeMailService(), client);
    expect(result.actions).toHaveLength(0);
    expect(result.reply).toMatch(/clarify/i);
  });

  it("rejects a malformed tool payload rather than dispatching it", async () => {
    const client = fakeClient([toolUseMessage("FILL_COMPOSE", { to: ["not-an-email"], subject: "Hi" })]);
    const result = await runAssistant("compose something", baseContext, [], fakeMailService(), client);
    expect(result.actions).toHaveLength(0);
    expect(result.rejections.length).toBeGreaterThan(0);
  });
});

/**
 * These tests drive the exact same runAssistant() loop through a *real*
 * OllamaMessagesClient instance (fetch mocked, no real network / no real
 * Ollama server) instead of the plain fakeClient() used above. The point is
 * to prove that validateAction()'s security rules and the confirmation-hash
 * gate are enforced identically when the tool_use block arrives via the
 * Ollama response-translation path, not just when constructed directly in a
 * test fixture. This is still a MOCKED test, not a real-Ollama test — see
 * the manual verification steps in README for that distinction.
 */
describe("runAssistant — via OllamaMessagesClient (mocked fetch, same validation/dispatch path)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubOllamaResponse(message: { role: string; content?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ message }),
        text: async () => "",
      })),
    );
  }

  function ollamaClient(): AnthropicMessagesClient {
    return new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
  }

  it("rejects an invalid tool payload from Ollama via the existing action validator, same as the Anthropic path", async () => {
    stubOllamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "FILL_COMPOSE", arguments: { to: ["not-an-email"], subject: "Hi" } } }],
    });
    const result = await runAssistant("compose something", baseContext, [], fakeMailService(), ollamaClient());
    expect(result.actions).toHaveLength(0);
    expect(result.rejections.length).toBeGreaterThan(0);
  });

  it("still downgrades an unconfirmed SEND_EMAIL to a confirmation request when routed through Ollama", async () => {
    stubOllamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "SEND_EMAIL", arguments: { to: ["john@example.com"], subject: "Hi", body: "Hello" } } }],
    });
    const result = await runAssistant("send an email to john saying hello", baseContext, [], fakeMailService(), ollamaClient());
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("REQUEST_SEND_CONFIRMATION");
    expect(result.rejections.length).toBeGreaterThan(0);
  });

  it("allows SEND_EMAIL via Ollama once the exact-payload confirmation hash matches", async () => {
    const payload = { to: ["john@example.com"], subject: "Hi", body: "Hello" };
    stubOllamaResponse({ role: "assistant", content: "", tool_calls: [{ function: { name: "SEND_EMAIL", arguments: payload } }] });
    const context: UIContext = {
      ...baseContext,
      pendingSendConfirmation: { payloadHash: await hashEmailPayload(payload), expiresAt: Date.now() + 60_000 },
    };
    const result = await runAssistant("yes, send it", context, [], fakeMailService(), ollamaClient());
    expect(result.actions[0].type).toBe("SEND_EMAIL");
    expect(result.rejections).toHaveLength(0);
  });

  it("translates a plain-text (no tool call) Ollama reply into a text-only response, same as Anthropic", async () => {
    stubOllamaResponse({ role: "assistant", content: "I'm not sure what you'd like me to do." });
    const result = await runAssistant("asdkjfhaskjdfh", baseContext, [], fakeMailService(), ollamaClient());
    expect(result.actions).toHaveLength(0);
    expect(result.reply).toMatch(/not sure/i);
  });
});
