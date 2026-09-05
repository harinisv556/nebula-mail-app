import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { OllamaMessagesClient, OllamaUnavailableError } from "@/lib/ai/ollama-client";

function fakeFetch(response: unknown, ok = true, status = 200) {
  // Typed to match global fetch's signature (so fetchMock.mock.calls[0] is
  // typed as [RequestInfo | URL, RequestInit | undefined]) — the params
  // themselves are asserted on via the returned mock, not used in the body.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
}

const FILL_COMPOSE_SCHEMA: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: { to: { type: "array", items: { type: "string" } } },
  required: ["to"],
};

const BASE_PARAMS: Anthropic.MessageCreateParamsNonStreaming = {
  model: "claude-opus-4-8", // deliberately the Anthropic literal — the adapter must ignore this and use its own configured model
  max_tokens: 2048,
  system: "You are a helpful assistant.",
  tools: [
    {
      name: "FILL_COMPOSE",
      description: "Fill the compose form.",
      input_schema: FILL_COMPOSE_SCHEMA,
    },
  ],
  messages: [{ role: "user", content: "compose an email" }],
};

describe("OllamaMessagesClient — request translation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to {baseUrl}/api/chat with the configured model, not the Anthropic literal in params.model", async () => {
    const fetchMock = fakeFetch({ message: { role: "assistant", content: "hi" } });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await client.messages.create(BASE_PARAMS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("qwen2.5:7b");
    expect(body.stream).toBe(false);
  });

  it("converts Anthropic tool definitions (input_schema) into Ollama function-calling format", async () => {
    const fetchMock = fakeFetch({ message: { role: "assistant", content: "ok" } });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await client.messages.create(BASE_PARAMS);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      type: "function",
      function: { name: "FILL_COMPOSE", parameters: FILL_COMPOSE_SCHEMA },
    });
  });

  it("prepends the system prompt as a system-role message", async () => {
    const fetchMock = fakeFetch({ message: { role: "assistant", content: "ok" } });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await client.messages.create(BASE_PARAMS);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0]).toMatchObject({ role: "system", content: "You are a helpful assistant." });
  });

  it("converts an assistant tool_use + user tool_result history turn into Ollama's flatter tool-call/tool-role format", async () => {
    const fetchMock = fakeFetch({ message: { role: "assistant", content: "done" } });
    vi.stubGlobal("fetch", fetchMock);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      ...BASE_PARAMS,
      messages: [
        { role: "user", content: "search for sarah" },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "tool_1", name: "SEARCH_EMAILS", input: { sender: "sarah" } }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool_1", content: JSON.stringify({ count: 0, results: [] }) }],
        },
      ],
    };

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await client.messages.create(params);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const assistantMsg = body.messages.find((m: { role: string }) => m.role === "assistant");
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls[0]).toMatchObject({ function: { name: "SEARCH_EMAILS", arguments: { sender: "sarah" } } });

    const toolMsg = body.messages.find((m: { role: string }) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(JSON.parse(toolMsg.content)).toMatchObject({ count: 0 });
  });
});

describe("OllamaMessagesClient — response translation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("converts an Ollama tool_calls response into a valid Anthropic tool_use content block", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "FILL_COMPOSE", arguments: { to: ["john@example.com"], subject: "Hi", body: "Hello" } } }],
        },
      }),
    );

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    const result = await client.messages.create(BASE_PARAMS);

    expect(result.stop_reason).toBe("tool_use");
    expect(result.content).toHaveLength(1);
    const block = result.content[0] as Anthropic.ToolUseBlock;
    expect(block.type).toBe("tool_use");
    expect(block.name).toBe("FILL_COMPOSE");
    expect(block.input).toMatchObject({ to: ["john@example.com"], subject: "Hi" });
    expect(typeof block.id).toBe("string");
  });

  it("parses stringified JSON tool-call arguments (some models emit these as a string, not an object)", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "OPEN_EMAIL", arguments: JSON.stringify({ emailId: "e1" }) } }],
        },
      }),
    );

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    const result = await client.messages.create(BASE_PARAMS);
    const block = result.content[0] as Anthropic.ToolUseBlock;
    expect(block.input).toMatchObject({ emailId: "e1" });
  });

  it("converts a plain-text Ollama response (no tool call) into a text content block", async () => {
    vi.stubGlobal("fetch", fakeFetch({ message: { role: "assistant", content: "I'm not sure what you mean." } }));

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    const result = await client.messages.create(BASE_PARAMS);

    expect(result.stop_reason).toBe("end_turn");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text", text: "I'm not sure what you mean." });
  });
});

describe("OllamaMessagesClient — failure handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws OllamaUnavailableError with a clear message when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await expect(client.messages.create(BASE_PARAMS)).rejects.toThrow(OllamaUnavailableError);
    await expect(client.messages.create(BASE_PARAMS)).rejects.toThrow(/Could not reach Ollama/);
  });

  it("throws OllamaUnavailableError on a non-2xx response (e.g. model not pulled)", async () => {
    vi.stubGlobal("fetch", fakeFetch({ error: "model not found" }, false, 404));

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "does-not-exist" });
    await expect(client.messages.create(BASE_PARAMS)).rejects.toThrow(OllamaUnavailableError);
  });

  it("throws OllamaUnavailableError when the response is missing the expected message field", async () => {
    vi.stubGlobal("fetch", fakeFetch({ done: true }));

    const client = new OllamaMessagesClient({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b" });
    await expect(client.messages.create(BASE_PARAMS)).rejects.toThrow(OllamaUnavailableError);
  });
});
