import { z } from "zod";
import { DateRangePresetSchema, MailFolderSchema } from "@/lib/types/actions";

const EmailFiltersInputSchema = z.object({
  folder: MailFolderSchema,
  keyword: z.string().optional(),
  sender: z.string().optional(),
  unreadOnly: z.boolean().optional(),
  dateRange: DateRangePresetSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const emailAddressLite = z.object({ name: z.string().optional(), email: z.string() });

export const UIContextSchema = z.object({
  currentView: z.enum(["inbox", "sent", "email_detail", "compose"]),
  currentFolder: MailFolderSchema,
  currentFilters: EmailFiltersInputSchema,
  openEmail: z
    .object({
      id: z.string(),
      threadId: z.string(),
      subject: z.string(),
      from: emailAddressLite,
      to: z.array(emailAddressLite),
      snippet: z.string(),
    })
    .optional(),
  composeDraft: z.object({ to: z.array(z.string()), subject: z.string(), hasBody: z.boolean() }).optional(),
  visibleEmailIds: z.array(z.string()),
  sendConfirmationPending: z.boolean(),
});

export const AssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: UIContextSchema,
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(20)
    .default([]),
});
