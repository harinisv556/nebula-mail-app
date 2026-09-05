import type Anthropic from "@anthropic-ai/sdk";

/**
 * Minimal shape `runAssistant` depends on from the Anthropic SDK. This is
 * the provider-abstraction seam: the real `@anthropic-ai/sdk` client
 * satisfies it, the test suite's fake clients satisfy it, and the
 * dev-only `OllamaMessagesClient` (src/lib/ai/ollama-client.ts) satisfies
 * it too — none of the tool-use loop, validation, or dispatch logic in
 * runAssistant needs to know which one it was given.
 *
 * Kept in its own file (rather than defined in assistant.ts, where it used
 * to live) so src/lib/ai/provider.ts can construct either implementation
 * without an assistant.ts <-> provider.ts import cycle.
 */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}
