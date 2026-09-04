import type { EmailFilters } from "@/lib/types/mail";
import type { AppAction } from "@/lib/types/actions";

/**
 * Mirrors the filter logic in the app-store's searchEmails/applyEmailFilters
 * so the assistant's server-side grounding query returns exactly what the
 * user will see once the same action is dispatched client-side.
 */
export function filtersForAction(action: Extract<AppAction, { type: "SEARCH_EMAILS" | "FILTER_EMAILS" }>, current: EmailFilters): EmailFilters {
  if (action.type === "SEARCH_EMAILS") {
    return {
      folder: action.payload.folder ?? current.folder,
      keyword: action.payload.keyword,
      sender: action.payload.sender,
      dateRange: action.payload.dateRange,
    };
  }
  return {
    ...current,
    folder: action.payload.folder ?? current.folder,
    unreadOnly: action.payload.unread ?? current.unreadOnly,
    dateRange: action.payload.dateRange ?? current.dateRange,
    sender: action.payload.sender ?? current.sender,
    keyword: action.payload.keyword ?? current.keyword,
    dateFrom: undefined,
    dateTo: undefined,
  };
}
