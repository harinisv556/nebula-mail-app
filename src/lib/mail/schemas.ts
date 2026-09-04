import { z } from "zod";
import { DateRangePresetSchema, MailFolderSchema } from "@/lib/types/actions";

/** Runtime validation for inbound requests — mirrors EmailFilters/ComposeDraft. */
export const EmailFiltersSchema = z.object({
  folder: MailFolderSchema.default("inbox"),
  keyword: z.string().trim().min(1).max(200).optional(),
  sender: z.string().trim().min(1).max(200).optional(),
  unreadOnly: z.boolean().optional(),
  dateRange: DateRangePresetSchema.optional(),
  dateFrom: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  dateTo: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
});

export const ComposeDraftSchema = z.object({
  to: z.array(z.string().email()).min(1, "At least one recipient is required."),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().trim().min(1, "Subject cannot be empty.").max(998),
  body: z.string().trim().min(1, "Body cannot be empty."),
  inReplyTo: z.string().optional(),
  threadId: z.string().optional(),
});

export function filtersFromSearchParams(params: URLSearchParams) {
  const raw: Record<string, unknown> = {
    folder: params.get("folder") ?? undefined,
    keyword: params.get("keyword") ?? undefined,
    sender: params.get("sender") ?? undefined,
    dateRange: params.get("dateRange") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
  };
  if (params.has("unreadOnly")) raw.unreadOnly = params.get("unreadOnly") === "true";
  return EmailFiltersSchema.parse(raw);
}
