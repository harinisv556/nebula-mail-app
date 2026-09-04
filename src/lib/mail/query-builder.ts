import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, subDays, subWeeks } from "date-fns";
import type { DateRangePreset, EmailFilters } from "@/lib/types/mail";

const GMAIL_DATE_FORMAT = "yyyy/MM/dd";

/** Resolves a relative preset into concrete [from, to) bounds, given "now". */
export function resolveDateRange(preset: DateRangePreset, now: Date = new Date()): { from?: Date; to?: Date } {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    case "last_week": {
      const start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const end = startOfWeek(now, { weekStartsOn: 1 });
      return { from: start, to: end };
    }
    case "last_7_days":
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case "last_10_days":
      return { from: startOfDay(subDays(now, 10)), to: endOfDay(now) };
    case "last_30_days":
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
    case "this_month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "all_time":
      return {};
  }
}

/**
 * Builds a Gmail search query string (the `q` param) from app-level filters.
 * Keeping this isolated means the rest of the app never constructs Gmail
 * query syntax directly.
 */
export function buildGmailQuery(filters: EmailFilters, now: Date = new Date()): string {
  const clauses: string[] = [];

  if (filters.folder === "sent") clauses.push("in:sent");
  else if (filters.folder === "trash") clauses.push("in:trash");
  else if (filters.folder === "drafts") clauses.push("in:drafts");
  else clauses.push("in:inbox");

  if (filters.unreadOnly) clauses.push("is:unread");
  if (filters.sender) clauses.push(`from:${quoteIfNeeded(filters.sender)}`);
  if (filters.keyword) clauses.push(quoteIfNeeded(filters.keyword));

  if (filters.dateFrom) clauses.push(`after:${format(new Date(filters.dateFrom), GMAIL_DATE_FORMAT)}`);
  if (filters.dateTo) clauses.push(`before:${format(new Date(filters.dateTo), GMAIL_DATE_FORMAT)}`);

  if (filters.dateRange && filters.dateRange !== "all_time" && !filters.dateFrom && !filters.dateTo) {
    const { from, to } = resolveDateRange(filters.dateRange, now);
    if (from) clauses.push(`after:${format(from, GMAIL_DATE_FORMAT)}`);
    if (to) clauses.push(`before:${format(to, GMAIL_DATE_FORMAT)}`);
  }

  return clauses.join(" ");
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
