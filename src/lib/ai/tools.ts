import type Anthropic from "@anthropic-ai/sdk";

const DATE_RANGE_ENUM = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "last_7_days",
  "last_10_days",
  "last_30_days",
  "this_month",
  "all_time",
];

const FOLDER_ENUM = ["inbox", "sent", "drafts", "trash"];

/**
 * Claude tool definitions — one per supported application action, plus
 * nothing else. The model can only ever emit one of these; every input is
 * re-validated against the Zod schemas in src/lib/types/actions.ts before
 * anything is dispatched (see validate-action.ts). This is the enforcement
 * point for "the AI must not execute arbitrary code."
 */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "NAVIGATE",
    description: "Switch the main view to the inbox, sent folder, or a blank compose screen. Do not use this to open a specific email — use OPEN_EMAIL for that.",
    input_schema: {
      type: "object",
      properties: { view: { type: "string", enum: ["inbox", "sent", "compose"] } },
      required: ["view"],
    },
  },
  {
    name: "SEARCH_EMAILS",
    description:
      "Search real emails by keyword, sender, and/or date range and show the results in the main inbox list. Call this whenever you need to find specific emails (e.g. 'the email from Sarah about the project update') or need real email IDs before calling OPEN_EMAIL or PREPARE_REPLY. Returns the matching emails so you can reason about them.",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Free-text search across subject and body." },
        sender: { type: "string", description: "Sender name or email address (substring match)." },
        dateRange: { type: "string", enum: DATE_RANGE_ENUM },
        folder: { type: "string", enum: FOLDER_ENUM, description: "Defaults to inbox." },
      },
    },
  },
  {
    name: "FILTER_EMAILS",
    description:
      "Apply structured filters (unread status, date range, sender) to the main inbox/sent list. Use this for commands like 'show only unread emails from this week'. Returns the matching emails.",
    input_schema: {
      type: "object",
      properties: {
        unread: { type: "boolean", description: "true = only unread emails." },
        dateRange: { type: "string", enum: DATE_RANGE_ENUM },
        sender: { type: "string" },
        keyword: { type: "string" },
        folder: { type: "string", enum: FOLDER_ENUM },
      },
    },
  },
  {
    name: "OPEN_EMAIL",
    description:
      "Open a specific email in the detail view by its real ID. You must already know the ID — call SEARCH_EMAILS first if you don't (e.g. to find 'the latest email from David').",
    input_schema: {
      type: "object",
      properties: { emailId: { type: "string" } },
      required: ["emailId"],
    },
  },
  {
    name: "OPEN_COMPOSE",
    description: "Open a blank compose window with no fields filled in.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "FILL_COMPOSE",
    description:
      "Open the compose window and fill in To/Subject/Body for a brand-new email (not a reply or forward). All three fields are required. The user reviews and sends — do not use SEND_EMAIL in the same turn as this.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string", format: "email" }, minItems: 1 },
        cc: { type: "array", items: { type: "string", format: "email" } },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "PREPARE_REPLY",
    description:
      "Prepare a reply to a specific email (usually the one currently open — see the context's openEmail). The recipient, subject, and quoted original are filled in automatically; optionally provide draftBody with reply text you want pre-written for the user to review.",
    input_schema: {
      type: "object",
      properties: {
        emailId: { type: "string" },
        draftBody: { type: "string", description: "Optional reply text to pre-fill above the quoted original." },
      },
      required: ["emailId"],
    },
  },
  {
    name: "PREPARE_FORWARD",
    description: "Prepare a forward of a specific email, optionally with a recipient and/or a note to add above the forwarded content.",
    input_schema: {
      type: "object",
      properties: {
        emailId: { type: "string" },
        to: { type: "array", items: { type: "string", format: "email" } },
        draftBody: { type: "string" },
      },
      required: ["emailId"],
    },
  },
  {
    name: "REQUEST_SEND_CONFIRMATION",
    description:
      "Show the fully-composed email to the user and ask them to confirm before sending. ALWAYS call this instead of SEND_EMAIL when the user first asks you to send something — never send on the first ask.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string", format: "email" }, minItems: 1 },
        cc: { type: "array", items: { type: "string", format: "email" } },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "SEND_EMAIL",
    description:
      "Actually send the email via Gmail. Only call this after the user has explicitly confirmed a REQUEST_SEND_CONFIRMATION you already showed them (e.g. they replied 'yes' or 'send it'). Never call this on an ambiguous or first-time request.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string", format: "email" }, minItems: 1 },
        cc: { type: "array", items: { type: "string", format: "email" } },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
];
