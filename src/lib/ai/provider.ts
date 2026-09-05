import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicMessagesClient } from "./client-types";
import { OllamaMessagesClient } from "./ollama-client";

/**
 * Development-only local-AI provider switch.
 *
 * Production forces Anthropic unconditionally — this is a hard safety net,
 * not just a default, so a stray `AI_PROVIDER=ollama` left in a real
 * deployment's environment can never silently swap the assistant onto an
 * unauthenticated local model. Only outside production does `AI_PROVIDER`
 * get consulted at all.
 */
export function selectProvider(): "anthropic" | "ollama" {
  if (process.env.NODE_ENV === "production") return "anthropic";
  return process.env.AI_PROVIDER === "ollama" ? "ollama" : "anthropic";
}

function buildAnthropicClient(): AnthropicMessagesClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable the assistant.");
  }
  return new Anthropic({ apiKey });
}

function buildOllamaClient(): AnthropicMessagesClient {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL;
  if (!model) {
    throw new Error(
      "AI_PROVIDER=ollama but OLLAMA_MODEL is not set. Add it to .env.local (e.g. OLLAMA_MODEL=qwen2.5:7b) " +
        "— pick a model that actually supports tool/function calling; not all local models do.",
    );
  }
  return new OllamaMessagesClient({ baseUrl, model });
}

/**
 * Constructs the assistant's default client when `runAssistant` isn't given
 * one explicitly (the test suite always injects a fake client and never
 * calls this). This is the only place provider selection happens — swap
 * `selectProvider()`'s result and both branches below already exist.
 */
export function getDefaultAssistantClient(): AnthropicMessagesClient {
  return selectProvider() === "ollama" ? buildOllamaClient() : buildAnthropicClient();
}
