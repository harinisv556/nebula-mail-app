import type Anthropic from "@anthropic-ai/sdk";
import type { AnthropicMessagesClient } from "./client-types";

/**
 * Development-only adapter implementing the exact same
 * `AnthropicMessagesClient` seam the real Anthropic SDK client (and the
 * test suite's fake clients) implement, by translating to/from a local
 * Ollama server's `/api/chat` tool-calling format. Everything downstream of
 * `messages.create()` in `runAssistant` — the tool-use loop,
 * `validateAction()`, grounding, dispatch — is unaware this isn't Anthropic.
 *
 * Not every locally-installed model supports tool/function calling well (or
 * at all) — see README for which model(s) were actually verified against
 * this adapter. A model that ignores the `tools` field will simply never
 * produce a `tool_use` block, which `runAssistant` already treats as "no
 * action, just a text reply" — the same as Anthropic never calling a tool.
 */
export class OllamaUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OllamaUnavailableError";
    this.cause = cause;
  }
}

interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: unknown };
}

interface OllamaChatMessage {
  role: string;
  content?: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  message: OllamaChatMessage;
  done?: boolean;
}

/** `params.tools` is typed as `ToolUnion[]` (it can include built-in tools like bash/computer-use that have no `input_schema`), but ASSISTANT_TOOLS is always a plain `Anthropic.Tool[]` — narrow defensively rather than assuming. */
function isCustomTool(tool: unknown): tool is Anthropic.Tool {
  return typeof tool === "object" && tool !== null && "input_schema" in tool;
}

/** Anthropic tool `input_schema` is already JSON Schema, same shape Ollama's `function.parameters` expects — this is close to a passthrough. */
function toOllamaTools(tools: Anthropic.MessageCreateParamsNonStreaming["tools"]): unknown[] | undefined {
  const customTools = (tools ?? []).filter(isCustomTool);
  if (!customTools.length) return undefined;
  return customTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.input_schema,
    },
  }));
}

/** Converts one Anthropic-shaped history entry (string content, or content blocks incl. tool_use/tool_result) into Ollama's flatter chat message(s). */
function contentBlocksToOllamaMessages(role: string, content: Anthropic.MessageParam["content"]): OllamaChatMessage[] {
  if (typeof content === "string") {
    return [{ role, content }];
  }

  if (role === "assistant") {
    // A previous assistant turn replayed from response.content: mix of text + tool_use blocks.
    const textParts: string[] = [];
    const toolCalls: OllamaToolCall[] = [];
    for (const block of content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, function: { name: block.name, arguments: block.input } });
      }
    }
    const msg: OllamaChatMessage = { role, content: textParts.join("\n") };
    if (toolCalls.length) msg.tool_calls = toolCalls;
    return [msg];
  }

  // A user turn carrying tool_result blocks — Ollama expects one "tool" message per result, not an array within one message.
  const out: OllamaChatMessage[] = [];
  for (const block of content) {
    if (block.type === "tool_result") {
      const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      out.push({ role: "tool", content: text });
    }
  }
  return out;
}

function toOllamaMessages(params: Anthropic.MessageCreateParamsNonStreaming): OllamaChatMessage[] {
  const messages: OllamaChatMessage[] = [];
  if (typeof params.system === "string" && params.system) {
    messages.push({ role: "system", content: params.system });
  }
  for (const m of params.messages) {
    messages.push(...contentBlocksToOllamaMessages(m.role, m.content));
  }
  return messages;
}

/** Converts Ollama's response message back into the Anthropic.Message shape the rest of runAssistant expects. */
function fromOllamaMessage(message: OllamaChatMessage, model: string): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = [];

  message.tool_calls?.forEach((tc, i) => {
    let input: unknown = tc.function.arguments;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        input = {};
      }
    }
    content.push({
      type: "tool_use",
      id: tc.id ?? `ollama_tool_${i}`,
      name: tc.function.name,
      input,
    } as Anthropic.ToolUseBlock);
  });

  if (message.content && message.content.trim()) {
    content.push({ type: "text", text: message.content, citations: null } as Anthropic.TextBlock);
  }

  return {
    id: `ollama_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: message.tool_calls?.length ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 } as Anthropic.Usage,
  } as Anthropic.Message;
}

export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
}

export class OllamaMessagesClient implements AnthropicMessagesClient {
  constructor(private readonly options: OllamaClientOptions) {}

  messages = {
    create: async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
      const { baseUrl, model } = this.options;
      const requestBody = {
        model,
        messages: toOllamaMessages(params),
        tools: toOllamaTools(params.tools),
        stream: false,
        ...(params.max_tokens ? { options: { num_predict: params.max_tokens } } : {}),
      };

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      } catch (err) {
        throw new OllamaUnavailableError(`Could not reach Ollama at ${baseUrl}. Make sure "ollama serve" is running.`, err);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new OllamaUnavailableError(`Ollama returned ${res.status} for model "${model}". ${text ? text.slice(0, 300) : ""}`.trim());
      }

      let data: OllamaChatResponse;
      try {
        data = (await res.json()) as OllamaChatResponse;
      } catch (err) {
        throw new OllamaUnavailableError("Ollama returned a response that could not be parsed as JSON.", err);
      }

      if (!data?.message) {
        throw new OllamaUnavailableError('Ollama\'s response was missing the expected "message" field.');
      }

      return fromOllamaMessage(data.message, model);
    },
  };
}
