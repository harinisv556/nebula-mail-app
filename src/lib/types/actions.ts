import { z } from "zod";

/**
 * The application action model.
 *
 * This is the single contract both the UI and the AI assistant speak.
 * A UI click and an AI tool-call both resolve to one of these validated
 * objects, which the app-store dispatcher (src/lib/store/app-store.ts)
 * executes identically regardless of where it came from. Nothing outside
 * this file defines what an "action" looks like — the AI can never invoke
 * anything that isn't listed here, and every payload is schema-validated
 * before it is dispatched (see src/lib/ai/validate-action.ts).
 */

const emailAddress = z.string().email();

export const DateRangePresetSchema = z.enum([
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "last_7_days",
  "last_10_days",
  "last_30_days",
  "this_month",
  "all_time",
]);

export const MailFolderSchema = z.enum(["inbox", "sent", "drafts", "trash"]);

// ---------------------------------------------------------------------------
// Individual action payloads
// ---------------------------------------------------------------------------

export const NavigateActionSchema = z.object({
  type: z.literal("NAVIGATE"),
  payload: z.object({
    view: z.enum(["inbox", "sent", "compose"]),
  }),
});

export const OpenEmailActionSchema = z.object({
  type: z.literal("OPEN_EMAIL"),
  payload: z.object({
    emailId: z.string().min(1),
  }),
});

export const OpenComposeActionSchema = z.object({
  type: z.literal("OPEN_COMPOSE"),
  payload: z.object({}).optional().default({}),
});

export const FillComposeActionSchema = z.object({
  type: z.literal("FILL_COMPOSE"),
  payload: z.object({
    to: z.array(emailAddress).min(1),
    cc: z.array(emailAddress).optional(),
    subject: z.string().min(1).max(998),
    body: z.string().min(1),
  }),
});

export const SearchEmailsActionSchema = z.object({
  type: z.literal("SEARCH_EMAILS"),
  payload: z.object({
    keyword: z.string().optional(),
    sender: z.string().optional(),
    dateRange: DateRangePresetSchema.optional(),
    folder: MailFolderSchema.optional(),
  }),
});

export const FilterEmailsActionSchema = z.object({
  type: z.literal("FILTER_EMAILS"),
  payload: z.object({
    unread: z.boolean().optional(),
    dateRange: DateRangePresetSchema.optional(),
    sender: z.string().optional(),
    keyword: z.string().optional(),
    folder: MailFolderSchema.optional(),
  }),
});

export const PrepareReplyActionSchema = z.object({
  type: z.literal("PREPARE_REPLY"),
  payload: z.object({
    emailId: z.string().min(1),
    /** Assistant-drafted reply text; the recipient/subject/quote are computed by the action layer. */
    draftBody: z.string().optional(),
  }),
});

export const PrepareForwardActionSchema = z.object({
  type: z.literal("PREPARE_FORWARD"),
  payload: z.object({
    emailId: z.string().min(1),
    to: z.array(emailAddress).optional(),
    draftBody: z.string().optional(),
  }),
});

export const RequestSendConfirmationActionSchema = z.object({
  type: z.literal("REQUEST_SEND_CONFIRMATION"),
  payload: z.object({
    to: z.array(emailAddress).min(1),
    cc: z.array(emailAddress).optional(),
    subject: z.string().min(1).max(998),
    body: z.string().min(1),
  }),
});

export const SendEmailActionSchema = z.object({
  type: z.literal("SEND_EMAIL"),
  payload: z.object({
    to: z.array(emailAddress).min(1),
    cc: z.array(emailAddress).optional(),
    subject: z.string().min(1).max(998),
    body: z.string().min(1),
  }),
});

export const AppActionSchema = z.discriminatedUnion("type", [
  NavigateActionSchema,
  OpenEmailActionSchema,
  OpenComposeActionSchema,
  FillComposeActionSchema,
  SearchEmailsActionSchema,
  FilterEmailsActionSchema,
  PrepareReplyActionSchema,
  PrepareForwardActionSchema,
  RequestSendConfirmationActionSchema,
  SendEmailActionSchema,
]);

export type AppAction = z.infer<typeof AppActionSchema>;
export type AppActionType = AppAction["type"];

export const ACTION_TYPES = AppActionSchema.options.map(
  (o) => o.shape.type.value,
) as AppActionType[];
