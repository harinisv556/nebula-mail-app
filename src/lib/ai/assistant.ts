import type Anthropic from "@anthropic-ai/sdk";
import type { MailService } from "@/lib/mail/mail-service";
import type { UIContext } from "@/lib/types/context";
import type { AppAction } from "@/lib/types/actions";
import { ASSISTANT_TOOLS } from "./tools";
import { validateAction } from "./validate-action";
import { filtersForAction } from "./action-to-filters";
import { getDefaultAssistantClient } from "./provider";
import type { AnthropicMessagesClient } from "./client-types";

export type { AnthropicMessagesClient } from "./client-types";

const MAX_AGENT_TURNS = 4;
const GROUNDING_RESULT_LIMIT = 10;

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantResponse {
  reply: string;
  actions: AppAction[];
  /** Actions the model attempted but that were rejected/downgraded — surfaced for transparency and debugging. */
  rejections: { type: string; reason: string }[];
  /** Real search/filter results from the most recent grounding query, for rich previews in the assistant panel. */
  emailPreviews: GroundingResult["results"];
}

const SYSTEM_PROMPT = `You are the AI assistant embedded in Nebula Mail, a Gmail-connected mail client. You are not a general chatbot — you are a copilot that DRIVES THE APPLICATION UI on the user's behalf.

Every capability you have is exposed as a tool. To do anything in the app — open an email, fill in a compose form, search, filter, reply — you MUST call the matching tool. Never claim you did something in the UI unless you actually called the corresponding tool. Never describe an action in plain text instead of calling the tool for it.

Rules:
- If you need to find or identify a specific email (e.g. "the latest email from David", "the email from Sarah about the project update"), call SEARCH_EMAILS first to get real results with real IDs, then act on them (e.g. OPEN_EMAIL).
- For a brand-new email, use FILL_COMPOSE to show the user a draft. Do NOT send it yet.
- To send an email, ALWAYS call REQUEST_SEND_CONFIRMATION first, even if the user's phrasing sounds confident. Only call SEND_EMAIL after the user clearly confirms in a follow-up message (e.g. "yes", "send it", "go ahead").
- For "reply to this" / "forward this", use the currently open email from the context below — call PREPARE_REPLY / PREPARE_FORWARD with its emailId.
- Every user turn is preceded by a CONTEXT block describing the current app state (view, folder, filters, open email, compose draft, whether a send confirmation is pending). Use it to resolve pronouns like "this" or "it". Never quote the raw CONTEXT block back to the user.
- Keep your text replies short and concrete — describe what you're doing/found, not generic pleasantries.
- If a request is ambiguous or you can't find a matching email, say so plainly instead of guessing.`;

function buildUserContent(context: UIContext, message: string): string {
  return `CONTEXT: ${JSON.stringify(context)}\n\nUSER: ${message}`;
}

function describeActionsFallback(actions: AppAction[]): string {
  if (actions.length === 0) return "I'm not sure how to help with that — could you rephrase?";
  const descriptions = actions.map((a) => {
    switch (a.type) {
      case "NAVIGATE":
        return `Navigating to ${a.payload.view}.`;
      case "SEARCH_EMAILS":
        return "Searching your emails.";
      case "FILTER_EMAILS":
        return "Filtering your inbox.";
      case "OPEN_EMAIL":
        return "Opening that email.";
      case "OPEN_COMPOSE":
        return "Opening a new compose window.";
      case "FILL_COMPOSE":
        return "I've filled in the compose form for you to review.";
      case "PREPARE_REPLY":
        return "I've drafted a reply for you to review.";
      case "PREPARE_FORWARD":
        return "I've drafted a forward for you to review.";
      case "REQUEST_SEND_CONFIRMATION":
        return `Ready to send to ${a.payload.to.join(", ")} — shall I send it?`;
      case "SEND_EMAIL":
        return "Sending it now.";
    }
  });
  return descriptions.join(" ");
}

export interface GroundingResult {
  count: number;
  results: { id: string; from: string; subject: string; date: string; preview: string }[];
}

async function executeGrounding(action: Extract<AppAction, { type: "SEARCH_EMAILS" | "FILTER_EMAILS" }>, mailService: MailService, context: UIContext): Promise<GroundingResult> {
  const filters = filtersForAction(action, context.currentFilters);
  const results = await mailService.listEmails(filters, GROUNDING_RESULT_LIMIT);
  return {
    count: results.length,
    results: results.map((r) => ({
      id: r.id,
      from: r.from.name ? `${r.from.name} <${r.from.email}>` : r.from.email,
      subject: r.subject,
      date: r.date,
      preview: r.preview,
    })),
  };
}

export async function runAssistant(
  userMessage: string,
  context: UIContext,
  history: AssistantTurn[],
  mailService: MailService,
  client?: AnthropicMessagesClient,
): Promise<AssistantResponse> {
  if (!client) {
    // Provider selection (Anthropic in production, always; optionally Ollama
    // in local dev via AI_PROVIDER=ollama) lives entirely in provider.ts —
    // see src/lib/ai/provider.ts. Everything below this line is identical
    // regardless of which client this resolves to.
    client = getDefaultAssistantClient();
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h): Anthropic.MessageParam => ({ role: h.role, content: h.text })),
    { role: "user", content: buildUserContent(context, userMessage) },
  ];

  const collectedActions: AppAction[] = [];
  const rejections: { type: string; reason: string }[] = [];
  let latestText = "";
  let lastGrounding: GroundingResult | null = null;

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: ASSISTANT_TOOLS,
      output_config: { effort: "medium" },
      messages,
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const combinedText = textBlocks.map((b) => b.text).join("\n").trim();
    if (combinedText) latestText = combinedText;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let shouldStop = false;

    for (const toolUse of toolUses) {
      const isGrounding = toolUse.name === "SEARCH_EMAILS" || toolUse.name === "FILTER_EMAILS";
      const validation = await validateAction(toolUse.name, toolUse.input, context);

      if (!validation.ok) {
        rejections.push({ type: toolUse.name, reason: validation.reason });
        if (validation.downgradeTo) collectedActions.push(validation.downgradeTo);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ status: "rejected", reason: validation.reason }),
          is_error: true,
        });
        if (!isGrounding) shouldStop = true;
        continue;
      }

      collectedActions.push(validation.action);

      if (isGrounding && (validation.action.type === "SEARCH_EMAILS" || validation.action.type === "FILTER_EMAILS")) {
        try {
          const grounding = await executeGrounding(validation.action, mailService, context);
          lastGrounding = grounding;
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(grounding) });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Search failed.";
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: message }), is_error: true });
        }
      } else {
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ status: "queued" }) });
        shouldStop = true;
      }
    }

    messages.push({ role: "user", content: toolResults });
    if (shouldStop) break;
  }

  const reply = latestText || describeActionsFallback(collectedActions);
  return { reply, actions: collectedActions, rejections, emailPreviews: lastGrounding?.results ?? [] };
}
