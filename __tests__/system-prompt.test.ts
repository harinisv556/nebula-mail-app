import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/ai/assistant";
import { ASSISTANT_TOOLS } from "@/lib/ai/tools";

/**
 * Prompt-regression guard, not a behavioral test. This does NOT prove any
 * model will actually follow this guidance — it only guards against someone
 * silently reverting the disambiguation wording that fixed a real failure
 * mode found via live browser testing: qwen2.5:7b chose FILTER_EMAILS
 * instead of SEARCH_EMAILS for "open the latest email from Google", and in
 * another run stopped after SEARCH_EMAILS to ask which email to open
 * instead of resolving "latest" to the first result. See the commit this
 * test shipped with for the real browser reproduction.
 */
describe("SYSTEM_PROMPT — open-a-specific-email disambiguation guidance (prompt-regression guard only)", () => {
  it("tells the model to never use FILTER_EMAILS to open a specific email", () => {
    expect(SYSTEM_PROMPT).toMatch(/NEVER use FILTER_EMAILS/i);
  });

  it("instructs the model not to stop and ask when there's a clear best match", () => {
    expect(SYSTEM_PROMPT).toMatch(/do not stop after SEARCH_EMAILS and ask/i);
  });

  it("defines the 'latest'/'most recent' tie-breaking rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/latest.*most recent.*first result|treat the first result.*latest/i);
  });

  it("scopes FILTER_EMAILS to list-narrowing only, never opening a specific email", () => {
    expect(SYSTEM_PROMPT).toMatch(/FILTER_EMAILS must NEVER be used to resolve\/open one specific email/i);
  });

  it("still requires REQUEST_SEND_CONFIRMATION before SEND_EMAIL — the security-critical rule is untouched", () => {
    expect(SYSTEM_PROMPT).toMatch(/ALWAYS call REQUEST_SEND_CONFIRMATION first/i);
  });
});

describe("Tool descriptions — open-a-specific-email disambiguation (prompt-regression guard only)", () => {
  it("SEARCH_EMAILS description prefers itself over FILTER_EMAILS for opening a specific email", () => {
    const tool = ASSISTANT_TOOLS.find((t) => t.name === "SEARCH_EMAILS");
    expect(tool?.description).toMatch(/Prefer this over FILTER_EMAILS/i);
  });

  it("FILTER_EMAILS description disclaims use for opening a single specific email", () => {
    const tool = ASSISTANT_TOOLS.find((t) => t.name === "FILTER_EMAILS");
    expect(tool?.description).toMatch(/Not for opening a single specific email/i);
  });

  it("no tool schemas/parameters changed — only description text", () => {
    const search = ASSISTANT_TOOLS.find((t) => t.name === "SEARCH_EMAILS");
    const filter = ASSISTANT_TOOLS.find((t) => t.name === "FILTER_EMAILS");
    expect(Object.keys((search?.input_schema as { properties?: object })?.properties ?? {})).toEqual([
      "keyword",
      "sender",
      "dateRange",
      "folder",
    ]);
    expect(Object.keys((filter?.input_schema as { properties?: object })?.properties ?? {})).toEqual([
      "unread",
      "dateRange",
      "sender",
      "keyword",
      "folder",
    ]);
  });
});
