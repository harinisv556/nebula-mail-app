import { afterEach, describe, expect, it, vi } from "vitest";
import { selectProvider, getDefaultAssistantClient } from "@/lib/ai/provider";

describe("selectProvider", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to anthropic when AI_PROVIDER is unset", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "");
    expect(selectProvider()).toBe("anthropic");
  });

  it("defaults to anthropic for any AI_PROVIDER value other than 'ollama'", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "something-else");
    expect(selectProvider()).toBe("anthropic");
  });

  it("selects ollama when AI_PROVIDER=ollama outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_PROVIDER", "ollama");
    expect(selectProvider()).toBe("ollama");
  });

  it("selects ollama in the test environment too (not just 'development')", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "ollama");
    expect(selectProvider()).toBe("ollama");
  });

  it("forces anthropic in production regardless of AI_PROVIDER — the hard safety net", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "ollama");
    expect(selectProvider()).toBe("anthropic");
  });
});

describe("getDefaultAssistantClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a clear error when resolving to anthropic without ANTHROPIC_API_KEY set", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => getDefaultAssistantClient()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("constructs an Anthropic client when ANTHROPIC_API_KEY is present (production behavior unchanged)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "ollama"); // must be ignored in production
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    const client = getDefaultAssistantClient();
    expect(client).toBeDefined();
    expect(typeof client.messages.create).toBe("function");
    // Constructor name is the real SDK's client class, not the Ollama adapter.
    expect(client.constructor.name).not.toBe("OllamaMessagesClient");
  });

  it("throws a clear error when AI_PROVIDER=ollama but OLLAMA_MODEL is not set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "");
    expect(() => getDefaultAssistantClient()).toThrow(/OLLAMA_MODEL/);
  });

  it("constructs an OllamaMessagesClient when AI_PROVIDER=ollama and OLLAMA_MODEL is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "qwen2.5:7b");
    const client = getDefaultAssistantClient();
    expect(client.constructor.name).toBe("OllamaMessagesClient");
  });
});
